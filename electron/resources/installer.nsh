; electron-builder 只有在 productName 全部为 ASCII 时才用产品名作为安装目录。
; 中文产品名会回退到 package name，导致出现 D:\Program Files\@xuyadesktop 这类路径。
; 这里显式覆盖 APP_FILENAME，让安装目录与产品名一致。
!define /redef APP_FILENAME "叙芽岛"
