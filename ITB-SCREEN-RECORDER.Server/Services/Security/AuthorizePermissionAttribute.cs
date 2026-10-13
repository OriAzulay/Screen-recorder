namespace ITB_SCREEN_RECORDER.Server.Services.Security;

using System;
using System.Text.Encodings.Web;
using System.Threading.Tasks;
using ITB_SCREEN_RECORDER.Server.Data.Repositories;
using ITB_SCREEN_RECORDER.Server.Models.Security;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = true)]
public sealed class AuthorizePermissionAttribute : AuthorizeAttribute
{
    public AuthorizePermissionAttribute(string permission) : base(policy: permission)
    {
    }
}

/// <summary>
/// סכמת אימות ברירת מחדל: מחזירה 401/403 במקום חריגה בעת Challenge/Forbid.
/// הזהות עצמה נקבעת ע"י ה-Bearer middleware ב-Program.cs.
/// </summary>
public sealed class BearerPassthroughAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string SchemeName = "Bearer";

    public BearerPassthroughAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, UrlEncoder encoder)
        : base(options, logger, encoder) { }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        return Task.FromResult(Context.User.Identity?.IsAuthenticated == true
            ? AuthenticateResult.Success(new AuthenticationTicket(Context.User, Scheme.Name))
            : AuthenticateResult.NoResult());
    }
}

public sealed class PermissionRequirement : IAuthorizationRequirement
{
    public string Permission { get; }
    public PermissionRequirement(string permission) => Permission = permission;
}

public sealed class PermissionPolicyProvider : DefaultAuthorizationPolicyProvider
{
    public PermissionPolicyProvider(IOptions<AuthorizationOptions> options) : base(options) { }

    public override async Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
    {
        var policy = await base.GetPolicyAsync(policyName);
        if (policy != null) return policy;

        return new AuthorizationPolicyBuilder()
            .AddRequirements(new PermissionRequirement(policyName))
            .Build();
    }
}

public sealed class PermissionAuthorizationHandler : AuthorizationHandler<PermissionRequirement>
{
    private readonly ICatalogRepository _repository;

    public PermissionAuthorizationHandler(ICatalogRepository repository)
    {
        _repository = repository;
    }

    protected override async Task HandleRequirementAsync(AuthorizationHandlerContext context, PermissionRequirement requirement)
    {
        // 1. מעקף במצב Open Mode: כל הפעולות מאושרות
        var policy = await _repository.GetSecurityPolicyAsync();
        if (policy.CurrentMode == AuthMode.Open)
        {
            context.Succeed(requirement);
            return;
        }

        // 2. מעקף משתמש על (Root Superuser)
        if (context.User.HasClaim("is_root", "true"))
        {
            context.Succeed(requirement);
            return;
        }

        // 3. בדיקת הרשאה ספציפית ב-Claims
        if (context.User.HasClaim("perm", requirement.Permission))
        {
            context.Succeed(requirement);
            return;
        }
    }
}