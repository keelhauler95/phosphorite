# Phosphorite Launcher for Windows PowerShell
# Simply invokes the Node.js bootstrap script

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bootstrapScript = Join-Path -Path $scriptDir -ChildPath (Join-Path -Path 'scripts' -ChildPath 'bootstrap.js')

# Set window title
$Host.UI.RawUI.WindowTitle = 'Phosphorite Launcher'

# Check if Node.js is installed
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "Node.js is not installed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Would you like to install it automatically using winget? (Y/N)" -ForegroundColor Yellow
    $response = Read-Host
    
    if ($response -match '^[Yy]') {
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if (-not $winget) {
            Write-Host "Winget not available. Please install Node.js manually from https://nodejs.org" -ForegroundColor Red
            Write-Host ""
            Write-Host "Press ENTER to exit..." -ForegroundColor Yellow
            [void][Console]::ReadLine()
            exit 1
        }
        
        Write-Host "Installing Node.js LTS..." -ForegroundColor Yellow
        $process = Start-Process -FilePath $winget.Path -ArgumentList 'install','--id','OpenJS.NodeJS.LTS','-e','--silent' -NoNewWindow -Wait -PassThru
        
        if ($process.ExitCode -eq 0) {
            Write-Host "Node.js installed successfully! Please restart this launcher." -ForegroundColor Green
        } else {
            Write-Host "Installation failed. Please install Node.js manually from https://nodejs.org" -ForegroundColor Red
        }
        
        Write-Host ""
        Write-Host "Press ENTER to exit..." -ForegroundColor Yellow
        [void][Console]::ReadLine()
        exit 0
    } else {
        Write-Host "Please install Node.js from https://nodejs.org and try again." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Press ENTER to exit..." -ForegroundColor Yellow
        [void][Console]::ReadLine()
        exit 1
    }
}

# Check if bootstrap.js exists
if (-not (Test-Path $bootstrapScript)) {
    Write-Host "Error: Could not find bootstrap script at $bootstrapScript" -ForegroundColor Red
    Write-Host "Press ENTER to exit..." -ForegroundColor Yellow
    [void][Console]::ReadLine()
    exit 1
}

# Launch the bootstrap script
try {
    & node $bootstrapScript
} catch {
    Write-Host "Error running bootstrap: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Press ENTER to exit..." -ForegroundColor Yellow
    [void][Console]::ReadLine()
    exit 1
}
