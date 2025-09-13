@echo off
title Discord Bot - Auto Restart
:loop
echo Starting the bot...
node monitor.js
echo Bot crashed or stopped. Restarting in 5 seconds...
timeout /t 5 /nobreak >nul
goto loop
