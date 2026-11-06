#!/usr/bin/env python3
"""Checks PyTorch can train on the GPU: npm run ml:check-gpu"""

import sys
import time

import torch

print('PyTorch %s, CUDA build %s' % (torch.__version__, torch.version.cuda or 'none (CPU-only wheel)'))
if torch.backends.mps.is_available():
    print('Apple GPU (MPS) available')
    sys.exit(0)
if not torch.cuda.is_available():
    if torch.version.cuda is None:
        sys.exit('No CUDA: this is the CPU-only PyTorch. Reinstall it from the CUDA index (docs/machine-learning/training.md#windows-with-an-nvidia-gpu).')
    sys.exit('No CUDA device found: check the NVIDIA driver with nvidia-smi.')

for i in range(torch.cuda.device_count()):
    p = torch.cuda.get_device_properties(i)
    print('cuda:%d %s, %.0f GB, compute capability %d.%d' % (i, p.name, p.total_memory / 1e9, p.major, p.minor))
arch = 'sm_%d%d' % torch.cuda.get_device_capability(0)
if arch not in torch.cuda.get_arch_list():
    print('Warning: this PyTorch build lists %s, not %s. Rerun ml\\setup-windows.ps1, which picks a build for this card.' % (', '.join(torch.cuda.get_arch_list()), arch))

# A short run of the network's shape (568 in, 256, 128) to prove it computes.
x = torch.randn(2048, 568, device='cuda')
net = torch.nn.Sequential(torch.nn.Linear(568, 256), torch.nn.ReLU(), torch.nn.Linear(256, 128), torch.nn.ReLU(), torch.nn.Linear(128, 28)).cuda()
opt = torch.optim.AdamW(net.parameters())
torch.cuda.synchronize()
t0 = time.time()
for _ in range(200):
    opt.zero_grad()
    net(x).square().mean().backward()
    opt.step()
torch.cuda.synchronize()
print('200 training steps of 2,048 positions in %.2fs: the GPU works.' % (time.time() - t0))
