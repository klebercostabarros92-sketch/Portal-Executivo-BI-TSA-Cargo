@echo off
chcp 65001 >nul
echo ============================================================================
echo   TSA CARGO / TSA LOGISTICA - PUBLICADOR AUTOMATICO GOOGLE APPS SCRIPT
echo   Script ID: 1N8ZLTuyyfmowpBIAIV2oMDbVQzb7AFB_WuHYXk5UUu7x5KXE2pNUKTvp
echo ============================================================================
echo.
if not exist "%USERPROFILE%\.clasprc.json" (
    echo [1/3] Nenhuma credencial do Google encontrada localmente.
    echo       Abrindo navegador para autenticar sua conta Google...
    call clasp login
) else (
    echo [1/3] Credencial Google encontrada!
)
echo.
echo [2/3] Enviando Code.gs, Index.html e appsscript.json para o Apps Script...
call clasp push -f
echo.
echo [3/3] Criando/atualizando implantacao do Web App...
call clasp deploy --description "Painel Executivo Compras e Manutencao TSA"
echo.
echo ============================================================================
echo   CONCLUIDO! Para abrir o projeto no navegador, execute: clasp open-script
echo ============================================================================
pause
