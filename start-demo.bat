@echo off
REM FieldForce 360 - starts the local demo server and opens it in your browser.
REM Keep this window open while using the demo; close it to stop.
cd /d "%~dp0"
start "" "http://localhost:8360/demo.html"
python -m http.server 8360 --directory www
