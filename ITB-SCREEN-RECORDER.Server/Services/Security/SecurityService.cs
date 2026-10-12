namespace ITB_SCREEN_RECORDER.Server.Services.Security;

using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using ITB_SCREEN_RECORDER.Core.Configuration;
using ITB_SCREEN_RECORDER.Server.Data.Repositories;
using ITB_SCREEN_RECORDER.Server.Models.Security;
using Microsoft.Extensions.Options;

public interface ISecurityService
{
    Task<IReadOnlyList<string>> CalculateEffectivePermissionsAsync(string userId, string roleId, bool isSystemImmutable);
    string GenerateJwtToken(string userId, string username, string roleId, IReadOnlyList<string> permissions, bool isSystemImmutable);
    ClaimsPrincipal? ValidateJwtToken(string token);
    Task<AuthResult> LoginAsync(string username, string password);
}

public sealed class SecurityService : ISecurityService
{
    private readonly ICatalogRepository _repository;
    private readonly LocalAuthenticationProvider _localAuth;
    private readonly LdapAuthenticationProvider _ldapAuth;
    private readonly IOptionsMonitor<SystemConfig> _configMonitor;

    public SecurityService(
        ICatalogRepository repository,
        LocalAuthenticationProvider localAuth,
        LdapAuthenticationProvider ldapAuth,
        IOptionsMonitor<SystemConfig> configMonitor)
    {
        _repository = repository;
        _localAuth = localAuth;
        _ldapAuth = ldapAuth;
        _configMonitor = configMonitor;
    }

    public async Task<AuthResult> LoginAsync(string username, string password)
    {
        var policy = await _repository.GetSecurityPolicyAsync();

        // 1. נסיון אימות מקומי תחילה (מאפשר תמיד כניסת משתמש העל / Break-Glass)
        var localResult = await _localAuth.AuthenticateAsync(username, password);
        if (localResult.Success)
        {
            await _repository.UpdateUserLastLoginAsync(localResult.UserId!, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            return localResult;
        }

        // 2. אם במצב StrictLdap - פנייה ל-Active Directory
        if (policy.CurrentMode == AuthMode.StrictLdap)
        {
            var ldapResult = await _ldapAuth.AuthenticateAsync(username, password);
            return ldapResult;
        }

        return localResult;
    }

    public async Task<IReadOnlyList<string>> CalculateEffectivePermissionsAsync(string userId, string roleId, bool isSystemImmutable)
    {
        // משתמש העל מקבל תמיד את כלל ההרשאות
        if (isSystemImmutable)
        {
            return PermissionKeys.All;
        }

        var role = await _repository.GetRoleByIdAsync(roleId);
        var permissions = new HashSet<string>(role?.Permissions ?? Array.Empty<string>(), StringComparer.OrdinalIgnoreCase);

        var user = await _repository.GetUserByIdAsync(userId);
        if (user != null)
        {
            foreach (var granted in user.PermissionOverridesGranted)
            {
                permissions.Add(granted);
            }
            foreach (var revoked in user.PermissionOverridesRevoked)
            {
                permissions.Remove(revoked);
            }
        }

        return permissions.ToList();
    }

    public string GenerateJwtToken(string userId, string username, string roleId, IReadOnlyList<string> permissions, bool isSystemImmutable)
    {
        var secConfig = _configMonitor.CurrentValue.Security;
        string secretKey = !string.IsNullOrWhiteSpace(secConfig?.JwtSecretKey) && secConfig.JwtSecretKey.Length >= 16
            ? secConfig.JwtSecretKey
            : "ITB_SCREEN_RECORDER_DEFAULT_SUPER_SECRET_KEY_2026!";

        int expirationHours = (secConfig?.TokenExpirationHours > 0) ? secConfig.TokenExpirationHours : 8;
        long exp = DateTimeOffset.UtcNow.AddHours(expirationHours).ToUnixTimeSeconds();
        long iat = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        var header = new { alg = "HS256", typ = "JWT" };
        var payload = new Dictionary<string, object>
        {
            ["sub"] = userId,
            ["name"] = username,
            ["role"] = roleId,
            ["is_root"] = isSystemImmutable ? "true" : "false",
            ["perm"] = permissions,
            ["iat"] = iat,
            ["exp"] = exp,
            ["iss"] = "ITB-SCREEN-RECORDER",
            ["aud"] = "ITB-Clients"
        };

        string headerJson = JsonSerializer.Serialize(header);
        string payloadJson = JsonSerializer.Serialize(payload);

        string headerB64 = Base64UrlEncode(Encoding.UTF8.GetBytes(headerJson));
        string payloadB64 = Base64UrlEncode(Encoding.UTF8.GetBytes(payloadJson));

        string unsignedToken = $"{headerB64}.{payloadB64}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secretKey));
        byte[] sigBytes = hmac.ComputeHash(Encoding.UTF8.GetBytes(unsignedToken));
        string sigB64 = Base64UrlEncode(sigBytes);

        return $"{unsignedToken}.{sigB64}";
    }

    public ClaimsPrincipal? ValidateJwtToken(string token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        var parts = token.Split('.');
        if (parts.Length != 3) return null;

        var secConfig = _configMonitor.CurrentValue.Security;
        string secretKey = !string.IsNullOrWhiteSpace(secConfig?.JwtSecretKey) && secConfig.JwtSecretKey.Length >= 16
            ? secConfig.JwtSecretKey
            : "ITB_SCREEN_RECORDER_DEFAULT_SUPER_SECRET_KEY_2026!";

        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secretKey));
        byte[] expectedSig = hmac.ComputeHash(Encoding.UTF8.GetBytes($"{parts[0]}.{parts[1]}"));
        byte[] actualSig = Base64UrlDecode(parts[2]);

        if (!CryptographicOperations.FixedTimeEquals(expectedSig, actualSig))
        {
            return null;
        }

        try
        {
            byte[] payloadBytes = Base64UrlDecode(parts[1]);
            using var doc = JsonDocument.Parse(payloadBytes);
            var root = doc.RootElement;

            if (root.TryGetProperty("exp", out var expProp) && expProp.GetInt64() < DateTimeOffset.UtcNow.ToUnixTimeSeconds())
            {
                return null;
            }

            var claims = new List<Claim>();
            if (root.TryGetProperty("sub", out var sub)) claims.Add(new Claim(ClaimTypes.NameIdentifier, sub.GetString() ?? string.Empty));
            if (root.TryGetProperty("name", out var name)) claims.Add(new Claim(ClaimTypes.Name, name.GetString() ?? string.Empty));
            if (root.TryGetProperty("role", out var role)) claims.Add(new Claim(ClaimTypes.Role, role.GetString() ?? string.Empty));
            if (root.TryGetProperty("is_root", out var isRoot)) claims.Add(new Claim("is_root", isRoot.GetString() ?? "false"));

            if (root.TryGetProperty("perm", out var perms) && perms.ValueKind == JsonValueKind.Array)
            {
                foreach (var p in perms.EnumerateArray())
                {
                    var val = p.GetString();
                    if (!string.IsNullOrEmpty(val))
                    {
                        claims.Add(new Claim("perm", val));
                    }
                }
            }

            var identity = new ClaimsIdentity(claims, "Bearer");
            return new ClaimsPrincipal(identity);
        }
        catch
        {
            return null;
        }
    }

    private static string Base64UrlEncode(byte[] input)
    {
        return Convert.ToBase64String(input)
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
    }

    private static byte[] Base64UrlDecode(string input)
    {
        string output = input.Replace('-', '+').Replace('_', '/');
        switch (output.Length % 4)
        {
            case 2: output += "=="; break;
            case 3: output += "="; break;
        }
        return Convert.FromBase64String(output);
    }
}