Webpack Insight+ 是一款功能强大的 Chrome 扩展，专为前端开发者和安全研究人员设计，用于分析 Webpack 打包的网页应用。它能够提取未加载的 JavaScript 代码块（chunks），扫描敏感信息，并提供深度分析功能。

<img width="2134" height="1204" alt="111" src="https://github.com/user-attachments/assets/48e00708-0bfc-4900-9dd5-ced66ceb66f1" />

功能亮点

🕵️‍♂️ Webpack 代码块分析
自动检测页面中的 Webpack 打包结构

提取未加载的异步代码块（chunks）

支持自定义 URL 前缀修正文件路径

查找/替换功能批量处理文件 URL

🔍 敏感信息扫描
检测多种敏感信息类型：

API 密钥和访问令牌

云存储凭证（如阿里云 OSS）

个人身份信息（身份证、手机号）

密码和认证凭据

JSON Web Tokens

按严重程度分类（高危、中危、低危）

可视化展示扫描结果

⚡ 高效文件访问
并行访问多个未加载文件

实时进度显示

一键停止访问功能

📋 便捷操作
复制单个或多个文件 URL

缓存扫描结果提升性能

深度分析模式（分析外部脚本内容）

安装方法
从 Chrome 网上应用店安装
打开 Chrome 网上应用店

搜索 "Webpack Insight+"

点击 "添加至 Chrome"

手动安装
下载扩展 ZIP 文件

解压缩到本地文件夹

打开 Chrome，进入 chrome://extensions/

启用右上角的 "开发者模式"

点击 "加载已解压的扩展程序"

选择解压后的文件夹

使用指南
打开扩展
点击浏览器工具栏中的 Webpack Insight+ 图标

分析页面
扩展会自动分析当前页面的 Webpack 结构

自定义处理（可选）

在 "自定义前缀" 输入框中添加 URL 前缀

使用 "查找/替换" 批量修改文件路径

查看结果

默认显示未加载的 Webpack 文件

勾选 "显示已加载文件" 查看所有文件

使用 "复制" 按钮获取文件 URL

深度分析
点击 "深度分析" 按钮获取更全面的结果（需要更多时间）

敏感信息扫描
点击 "检测敏感信息" 扫描文件中的敏感数据

访问文件

点击单个文件旁的 "访问" 按钮

使用 "访问所有文件" 批量处理未加载文件

敏感信息检测规则
扩展检测以下类型的敏感信息：

类别	检测内容	严重程度
身份认证	API 密钥、访问令牌	高危
云存储	OSS 存储桶 URL、访问密钥	中危
个人身份信息	身份证号码、手机号码	高危
认证凭据	Basic Auth、OAuth 令牌	高危
开发凭证	GitHub 令牌、LinkedIn 密钥	中危
应用配置	敏感配置项、加密字段	高危
用户凭证	密码、认证密钥	高危

技术架构
<img width="1800" height="2696" alt="1" src="https://github.com/user-attachments/assets/821771c5-bb4a-4a62-8c38-6dc0baab4a16" />

贡献指南
欢迎贡献代码！请遵循以下步骤：

Fork 项目仓库

创建特性分支 (git checkout -b feature/AmazingFeature)

提交更改 (git commit -m 'Add some AmazingFeature')

推送到分支 (git push origin feature/AmazingFeature)

发起 Pull Request

许可证
本项目采用 MIT 许可证

风岚sec_TFour - 让 Webpack 分析更简单、更安全！
