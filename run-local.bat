@echo off
echo ===================================================
echo   Distributed Inference Monitor - Local Runner
echo ===================================================
echo.
echo Installing dependencies for TypeScript Worker...
cd workers\typescript-worker
call npm install
cd ..\..

echo Installing dependencies for API Gateway...
cd api-gateway
call npm install
cd ..

echo.
echo Launching components in separate terminal windows...
echo.

:: Start Python Worker
echo Starting Python Worker on http://localhost:8000 ...
start "Python Worker (Port 8000)" cmd /k "set PYTHON_WORKER_PORT=8000 && python workers/python-worker/worker.py"

:: Start TypeScript Worker
echo Starting TypeScript Worker on http://localhost:3001 ...
start "TypeScript Worker (Port 3001)" cmd /k "set TS_WORKER_PORT=3001 && set PYTHON_WORKER_URL=http://localhost:8000 && cd workers\typescript-worker && npm run dev"

:: Start API Gateway
echo Starting API Gateway on http://localhost:3000 ...
start "API Gateway (Port 3000)" cmd /k "set PORT=3000 && set PYTHON_WORKER_URL=http://localhost:8000 && set TYPESCRIPT_WORKER_URL=http://localhost:3001 && set NODE_ENV=development && set LOG_LEVEL=debug && cd api-gateway && npm run dev"

echo.
echo ===================================================
echo   All components started!
echo ===================================================
echo   - API Gateway: http://localhost:3000
echo   - TS Worker:   http://localhost:3001
echo   - Py Worker:   http://localhost:8000
echo.
echo   To test the system, you can use:
echo   curl -X POST http://localhost:3000/infer -H "Content-Type: application/json" -d "{\"prompt\": \"Hello World\"}"
echo ===================================================
pause
