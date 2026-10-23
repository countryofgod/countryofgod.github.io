# 上帝之国 · Android 原生版

Android 8.0（API 26）及以上，版本 2.0.0。六个分区由 Android 原生 View、Canvas、ScrollView、EditText、MediaPlayer 实现，不创建 WebView，不注入网页 CSS 或 JavaScript。网站仍保持原样；内容通过原有 JSON API 与每日文本文件读取。

保留原图、原字体、黑白与暗红视觉。手机上重新编排为单列阅读：呈示部播放器在上、内容在下，展開部单篇卡片与目录，按年／月展开的档案，横滑画廊，尾聲留言与照片流。右下角六章节菜单展开时背景高斯模糊且不可操作，点击背景或系统返回收起。Android 12 及以上使用 RenderEffect，旧系统使用降采样截图和系统高斯模糊。

字体、图片与社交图标在构建时从网站原始资源复制／转换到生成目录；不会覆盖网站素材。旧 `android-shell.css/js` 与 WebView 检查工具不再打包或执行。

## 构建

使用 JDK 17、Android SDK Platform 35、Build Tools 35.0.0、Gradle 8.9，并接受 SDK 许可。设置 `JAVA_HOME`、`ANDROID_HOME`；脚本也会查找 `.toolchain` 中的本机工具。

```powershell
./android/build.ps1 -Check
```

默认内容地址为 `https://gods-country.countryofgod.workers.dev/`。联网获取正文、留言、图片与音乐；不是完整离线包。网页内容更新不需要重打包，但原生布局、随包字体／图片更新需要重新构建。

调试 APK：`app/build/outputs/apk/debug/app-debug.apk`。调试签名仅供预览，不是商店发布签名；正式发布需自行保管稳定签名密钥。release 仅允许 HTTPS。

## 本机预览

在仓库根目录启动 `npm start`。通过 USB／模拟器转发端口：

```powershell
adb reverse tcp:3000 tcp:3000
./android/build.ps1 -SiteUrl http://localhost:3000/ -Check
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n dev.countryofgod.app.debug/dev.countryofgod.app.MainActivity
```

该预览包依赖电脑的本地服务器与端口转发。也可用同一局域网的电脑 IP 构建；官方 Android 模拟器可使用 `http://10.0.2.2:3000/`。HTTP 仅限 debug，不在本地预览输入正式管理口令。

## 数据与行为

- 六页分别保存滚动位置，切页不销毁 iPod。正文、诗歌和歌词保留原始换行；投稿首段、作者与全文均保留。
- iPod 保留三个分类、五个机身按键与只读进度。进入音乐不自动播放，首末曲不循环；阅读页的音乐进度可拖动。播放器切页继续，进入后台暂停，不添加后台服务、通知或音量控件。
- 留言、回声和撤回沿用原接口及设备 Cookie；Cookie 与本地草稿按服务端地址隔离，服务器草稿自动同步。提交失败保留输入，提交成功清空正文与附件；每篇一次的回声规则沿用服务器。
- 图片使用系统文档选择器，不请求相册／存储权限。类型及 5 MiB 上限沿用网站；服务端未配置图片存储时带图提交仍会失败，不伪造成功。
- 阅读页由原生文本与控件呈现；半年归档限制、随机阅读全文保留。管理入口、投稿邮件等交给系统浏览器或邮件应用；六个分区与文章阅读不加载网页。
- 横竖屏、安全区域、键盘避让采用 Android 布局与窗口 Insets；画廊／照片流遵循系统关闭动画设置。不添加网页之外的引导文案和操作控件。
- 社交地址及 SylvApple 地址仍沿用网站尚未配置的 `#` 行为，不擅自替换成其他目的地。

## 检查

`build.ps1 -Check` 执行 APK 构建、JUnit 与 lint。纯 Java 测试覆盖链接策略、请求同源与大小限制、文本／歌单解析以及受保护投稿完整性。

模拟器／设备连接后：

```powershell
$env:ADB = '你的 adb.exe 完整路径'
$env:ANDROID_SERIAL = '设备序列号'
node android/tools/check-native.mjs
```

检查六页原生控件树（没有 WebView）、章节菜单与背景隔离、系统返回、iPod 分类、文章目录、原生阅读、留言抽屉和图片选择取消，再检查 320dp 小屏与 1.3 倍字体。设备支持时额外检查横屏；模拟器强制保持竖屏时明确跳过，不算通过。可加 `--layout-only` 仅检查布局。截图与控件树位于忽略目录 `.toolchain/native-check/`。检查期间临时修改系统动画、分辨率与字体缩放并在结束后恢复，不提交留言或回声。

仍需在实际目标手机验证音频输出、带图提交与撤回、输入法、弱网、不同 Android 版本及无障碍读屏；模拟器截图不能替代这些验收。
