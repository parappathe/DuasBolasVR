@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
title Duas Bolas VR - servidor para o Quest
python serve.py --https
pause
