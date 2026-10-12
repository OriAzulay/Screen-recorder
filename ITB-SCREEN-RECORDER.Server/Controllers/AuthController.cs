namespace ITB_SCREEN_RECORDER.Server.Controllers;

using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using ITB_SCREEN_RECORDER.Server.Data.Repositories;
using ITB_SCREEN_RECORDER.Server.Models.Security;
using ITB_SCREEN_RECORDER.Server.Services.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

public record LoginRequest(string Username, string Password);
public record SelectRoleRequest(string? UserId, string RoleId);

[ApiController]
[Route("api/v1/auth")]
public class AuthController : ControllerBase
{
    private readonly ISecurityService _securityService;
    private readonly ICatalogRepository _repository;

    public AuthController(ISecurityService securityService, ICatalogRepository repository)
    {
        _securityService = securityService;
        _repository = repository;
    }

    /// <summary>
    /// בדיקת מצב האבטחה של המערכת (האם דרוש לוגין מקדים או שהכניסה פתוחה)
    /// </summary>
    [HttpGet("status")]
    [AllowAnonymous]
    public async Task<IActionResult> GetAuthStatus()
    {
        var policy = await _repository.GetSecurityPolicyAsync();
        bool isOpenMode = policy.CurrentMode == AuthMode.Open;

        return Ok(new
        {
            Mode = policy.CurrentMode.ToString(),
            IsOpenMode = isOpenMode,
            IsAuthenticated = User.Identity?.IsAuthenticated ?? false,
            CurrentUsername = User.Identity?.Name,
            CurrentRole = User.FindFirstValue(ClaimTypes.Role),
            IsRoot = User.HasClaim("is_root", "true")
        });
    }

    /// <summary>
    /// שליפת כלל התפקידים המוגדרים במערכת (עבור ה-Role Launchpad Grid)
    /// </summary>
    [HttpGet("roles")]
    [AllowAnonymous]
    public async Task<IActionResult> GetLaunchpadRoles()
    {
        var roles = await _repository.GetAllRolesAsync();
        return Ok(roles);
    }

    /// <summary>
    /// אימות משתמש (במצב Strict) - מחזיר את פרטי המשתמש ורשימת התפקידים הזמינים עבורו
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { Message = "Username and password are required." });
        }

        var result = await _securityService.LoginAsync(request.Username.Trim(), request.Password);
        if (!result.Success)
        {
            return Unauthorized(new { Message = result.ErrorMessage ?? "Invalid credentials." });
        }

        return Ok(new
        {
            UserId = result.UserId,
            Username = result.Username,
            DisplayName = result.DisplayName,
            IsSystemImmutable = result.IsSystemImmutable,
            AssignedRoleIds = result.AssignedRoleIds
        });
    }

    /// <summary>
    /// בחירת תפקיד מתוך ה-Launchpad והנפקת JWT Token הנושא את הרשאות התפקיד
    /// </summary>
    [HttpPost("select-role")]
    [AllowAnonymous]
    public async Task<IActionResult> SelectRole([FromBody] SelectRoleRequest request)
    {
        if (request == null || string.IsNullOrWhiteSpace(request.RoleId))
        {
            return BadRequest(new { Message = "RoleId is required." });
        }

        var policy = await _repository.GetSecurityPolicyAsync();
        bool isOpenMode = policy.CurrentMode == AuthMode.Open;

        string targetUserId;
        string targetUsername;
        bool isRoot = false;

        if (isOpenMode)
        {
            // במצב פתוח (Open Mode) - נוצר סשן אנונימי מבוסס התפקיד שנבחר בגריד
            targetUserId = "usr_guest";
            targetUsername = "Operator";
        }
        else
        {
            // במצב Strict - מוודאים זהות משתמש
            if (string.IsNullOrWhiteSpace(request.UserId))
            {
                return Unauthorized(new { Message = "User authentication required in strict mode." });
            }

            var user = await _repository.GetUserByIdAsync(request.UserId);
            if (user == null)
            {
                return Unauthorized(new { Message = "User not found." });
            }

            targetUserId = user.Id;
            targetUsername = user.Username;
            isRoot = user.IsSystemImmutable;

            // בדיקה שהמשתמש אכן מורשה לבחור בתפקיד זה (אלא אם הוא משתמש העל החסין)
            if (!isRoot && !user.AssignedRoleIds.Contains(request.RoleId, StringComparer.OrdinalIgnoreCase))
            {
                return Forbid();
            }
        }

        // חישוב סל הרשאות אפקטיבי
        var permissions = await _securityService.CalculateEffectivePermissionsAsync(targetUserId, request.RoleId, isRoot);

        // הנפקת JWT חתום
        string token = _securityService.GenerateJwtToken(targetUserId, targetUsername, request.RoleId, permissions, isRoot);

        return Ok(new
        {
            Token = token,
            RoleId = request.RoleId,
            Username = targetUsername,
            Permissions = permissions,
            IsRoot = isRoot
        });
    }
}