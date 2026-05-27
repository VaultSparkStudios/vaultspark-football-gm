@echo off
setlocal
set "REPO_ROOT=%~dp0.."
codex --disable apps -C "%REPO_ROOT%" %*
