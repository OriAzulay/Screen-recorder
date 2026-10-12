namespace ITB_SCREEN_RECORDER.Server.Services.Security;

using System;
using System.Threading.Tasks;
using ITB_SCREEN_RECORDER.Server.Data.Repositories;
using ITB_SCREEN_RECORDER.Server.Models.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Options;

[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class, AllowMultiple = true)]
public sealed class AuthorizePermissionAttribute : AuthorizeAttribute
{
    public AuthorizePermissionAttribute(string permission) : base(policy: permission)
    {
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