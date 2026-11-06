# Sets up ml\.venv on Windows with the CUDA build of PyTorch, then checks the
# GPU. Run from the repository root in PowerShell:
#
#   powershell -ExecutionPolicy Bypass -File ml\setup-windows.ps1
#
# The CUDA build is picked from the card's compute capability. Current PyTorch
# runs on Turing and newer (Titan RTX, compute 7.5+); the Titan V, Xp and X
# (Volta, Pascal) need PyTorch 2.7 with CUDA 12.6, which has wheels
# for Python 3.9 to 3.13. -Index forces one index,
# such as cu128.

param([string]$Index = '')
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)

if (Get-Command py -ErrorAction SilentlyContinue) { $py = 'py'; $pyArgs = @('-3') }
elseif (Get-Command python -ErrorAction SilentlyContinue) { $py = 'python'; $pyArgs = @() }
else { throw 'No Python found: install Python 3.10+ from python.org (tick "Add python.exe to PATH").' }

if (-not (Get-Command nvidia-smi -ErrorAction SilentlyContinue)) {
  Write-Warning 'nvidia-smi not found: install the latest NVIDIA driver, or PyTorch will only see the CPU.'
} else { nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv }

if (-not (Test-Path ml\.venv\Scripts\python.exe)) {
  & $py @pyArgs -m venv ml\.venv
  if ($LASTEXITCODE) { throw 'Could not create ml\.venv' }
}
$venv = 'ml\.venv\Scripts\python.exe'
& $venv -m pip install --upgrade pip
$cap = 0.0
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
  try { $cap = [double]((nvidia-smi --query-gpu=compute_cap --format=csv,noheader | Select-Object -First 1).Trim()) }
  catch { Write-Warning 'Could not read the compute capability (old driver?): trying current PyTorch' }
}
if ($Index) { $tries = @(@{ index = $Index; spec = 'torch' }) }
elseif ($cap -gt 0 -and $cap -lt 7.5) {
  Write-Host "Compute capability $cap (Pascal or Volta): installing PyTorch 2.7 with CUDA 12.6"
  $tries = @(@{ index = 'cu126'; spec = 'torch==2.7.1' })
} else { $tries = @('cu132', 'cu130', 'cu128') | ForEach-Object { @{ index = $_; spec = 'torch' } } }
$installed = $false
foreach ($t in $tries) {
  Write-Host "Installing $($t.spec) from the $($t.index) index"
  & $venv -m pip install --upgrade $t.spec --index-url "https://download.pytorch.org/whl/$($t.index)"
  if (-not $LASTEXITCODE) { $installed = $true; break }
}
if (-not $installed) { throw 'PyTorch install failed: see https://pytorch.org/get-started/locally/ for the current command' }
& $venv -m pip install -r ml\requirements.txt
if ($LASTEXITCODE) { throw 'Requirements install failed' }
& $venv ml\check_gpu.py
