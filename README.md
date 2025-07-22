Webpack Insight+ 是一款功能强大的 Chrome 扩展，专为前端开发者和安全研究人员设计，用于分析 Webpack 打包的网页应用。它能够提取未加载的 JavaScript 代码块（chunks），扫描敏感信息，并提供深度分析功能。

<img width="2134" height="1204" alt="111" src="https://github.com/user-attachments/assets/48e00708-0bfc-4900-9dd5-ced66ceb66f1" />


主要功能：

1.提取异步js

![deepseek_mermaid_20250722_bab0e2](https://github.com/user-attachments/assets/e78fa531-414b-4fc9-b1f5-b82e4738fd95)




2.敏感信息的检测(实验性功能，不能完全替代hae，此功能在于快速的检索一些敏感信息。)

3.配合Hae进行敏感信息检测(强烈推荐！！)

使用技巧:

配合hae食用效果更加，通过深度分析来获取异步js路径，再通过主动加载的js快速判断一下异步js的完整路径是否正确，点击访问所有文件后，会在网络中对所有提取的异步js进行访问。

同时在burpsuite中也能看到对应加载的数据包，更大程度的获取到网站所有的js文件，并对这些js文件进行敏感信息，以及接口的研究。



