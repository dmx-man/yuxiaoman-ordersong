; 安装前钩子: 升级安装到同一目录时, 先结束正在运行的旧进程 (start.exe),
; 否则旧进程会锁住 exe 与 resources 文件, 导致新文件无法覆盖 -> 一直显示旧代码.
!macro NSIS_HOOK_PREINSTALL
  ExecWait 'taskkill /f /im start.exe'
!macroend
