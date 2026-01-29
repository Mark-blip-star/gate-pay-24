# Script to add changed files, create commits (messages in English), and push the branch
# Usage: .\commit-and-push.ps1
# Or single commit: .\commit-and-push.ps1 -SingleCommit

param(
    [switch]$SingleCommit  # If set — one commit for all changes
)

$ErrorActionPreference = "Stop"
$repoRoot = $PSScriptRoot

# Check if there are changes
$status = git -C $repoRoot status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "No changes to commit." -ForegroundColor Yellow
    exit 0
}

$branch = git -C $repoRoot rev-parse --abbrev-ref HEAD
Write-Host "Branch: $branch" -ForegroundColor Cyan
Write-Host ""

if ($SingleCommit) {
    # Single commit for all changes
    git -C $repoRoot add -A
    git -C $repoRoot commit -m "feat: prisma stripe payments integration (backend + frontend)"
    Write-Host "Created single commit." -ForegroundColor Green
} else {
    # Logical file groups with English commit messages
    $groups = @(
        @{
            Paths = @("backend/nest-cli.json")
            Message = "chore(backend): nest-cli deleteOutDir option"
        },
        @{
            Paths = @("backend/src/payments/dto.ts", "backend/src/payments/payments.controller.ts")
            Message = "feat(payments): payment DTOs and controller updates"
        },
        @{
            Paths = @("backend/src/stripe/stripe.controller.ts", "backend/src/stripe/stripe.service.ts")
            Message = "feat(stripe): stripe webhook and payment handling"
        },
        @{
            Paths = @("backend/src/transactions/transactions.controller.ts")
            Message = "feat(transactions): transactions controller updates"
        },
        @{
            Paths = @("frontend/src/lib/api.ts", "frontend/src/pages/Dashboard.tsx")
            Message = "feat(frontend): API client and Dashboard for payments"
        },
        @{
            Paths = @("frontend/vite.config.ts")
            Message = "chore(frontend): vite proxy for /api"
        }
    )

    foreach ($group in $groups) {
        $toAdd = @()
        foreach ($path in $group.Paths) {
            $fullPath = Join-Path $repoRoot $path
            if (Test-Path $fullPath) {
                $fileStatus = git -C $repoRoot status --porcelain $path 2>$null
                if (-not [string]::IsNullOrWhiteSpace($fileStatus)) {
                    $toAdd += $path
                }
            }
        }
        if ($toAdd.Count -gt 0) {
            foreach ($p in $toAdd) {
                git -C $repoRoot add $p
            }
            git -C $repoRoot commit -m $group.Message
            Write-Host "Commit: $($group.Message)" -ForegroundColor Green
        }
    }

    # Add any other changed files not in the groups
    $remaining = git -C $repoRoot status --porcelain
    if (-not [string]::IsNullOrWhiteSpace($remaining)) {
        git -C $repoRoot add -A
        git -C $repoRoot commit -m "chore: misc updates"
        Write-Host "Commit: chore: misc updates" -ForegroundColor Green
    }
}

# Push the branch
Write-Host ""
Write-Host "Pushing branch $branch..." -ForegroundColor Cyan
git -C $repoRoot push -u origin $branch
Write-Host "Done." -ForegroundColor Green
