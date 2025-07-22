function findWebpackChunks(shouldFetchScripts = false) {
  try {
    const loadedFiles = new Set();
    const unloadedFiles = new Set();

    // 获取当前页面的基础URL
    const baseUrl = window.location.origin;

    // 辅助函数：构建完整URL
    const buildFullUrl = (path) => {
      if (path.startsWith('http')) return path;
      if (path.startsWith('//')) return window.location.protocol + path;
      if (path.startsWith('/')) return baseUrl + path;
      return baseUrl + '/' + path;
    };

    // 优化的脚本内容分析函数
    const analyzeScriptContent = (content) => {
      // 查找函数定义和路径前缀
      const functionMatch = content.match(/([a-zA-Z]\.[a-zA-Z])\s*\+\s*["']([^"']+)["']/);
      let basePath = '';
      if (functionMatch) {
        basePath = functionMatch[2];
      }

      // 合并所有正则表达式模式为一个更高效的模式
      // 模式1: 查找标准的chunk映射
      const chunkMapMatch = content.match(/return.*?\((\{\s*"\s*[^}]+\})\s*.*?(\{\s*"\s*[^}]+\})\[[a-zA-Z]\]\s*\+\s*"(.*?\.js)"/);
      if (chunkMapMatch) {
        let [_, nameMap, hashMap, suffix] = chunkMapMatch;
        const suffixtoo = suffix.match(/\]\s*\+\s*"(.*?\.js)/);
        if (suffixtoo) {
          suffix = suffixtoo[1];
        }

        // 解析 chunk 名称映射
        const nameEntries = nameMap.match(/"[^"]+"\s*:\s*"[^"]+"/g) || [];
        const chunkNames = {};

        nameEntries.forEach(entry => {
          const [key, value] = entry.replace(/"/g, '').split(':').map(s => s.trim());
          chunkNames[key] = value;
        });

        // 解析 hash 映射
        const hashEntries = hashMap.match(/"[^"]+"\s*:\s*"[^"]+"/g) || [];

        hashEntries.forEach(entry => {
          const [key, hash] = entry.replace(/"/g, '').split(':').map(s => s.trim());
          const chunkName = chunkNames[key] || key;
          const jsPath = `${basePath}${chunkName}.${hash}${suffix}`;
          const fullUrl = buildFullUrl(jsPath);
          if (!loadedFiles.has(fullUrl)) {
            unloadedFiles.add(fullUrl);
          }
        });
        return;
      }

      // 模式2: 查找替代格式的chunk映射
      const altMatch = content.match(/\{\s*"\s*[^}]+\}\[[a-zA-Z]\]\s*\+\s*"(.*?\.js)"/);
      if (altMatch) {
        const chunkEntries = altMatch[0].match(/"[^"]+"\s*:\s*"[^"]+"/g) || [];
        const fileSuffix = altMatch[1];
        chunkEntries.forEach(entry => {
          const [chunkName, hash] = entry.replace(/"/g, '').split(':').map(s => s.trim());
          const jsPath = `${basePath}${chunkName}.${hash}${fileSuffix}`;
          const fullUrl = buildFullUrl(jsPath);
          if (!loadedFiles.has(fullUrl)) {
            unloadedFiles.add(fullUrl);
          }
        });
        return;
      }

      // 模式3: 查找另一种替代格式
      const altMatch2 = content.match(/(\+\{.*?\}\[[a-zA-Z]\]\+".*?\.js")/);
      if (altMatch2) {
        const chunkEntries2 = altMatch2[0].match(/"?([\w].*?)"?:"(.*?)"/g) || [];
        let fileSuffix2 = altMatch2[1];

        // 调整以从完整的匹配字符串中提取实际的文件后缀，例如 ".js"
        const suffixExtractMatch = fileSuffix2.match(/\.js"$/);
        if (suffixExtractMatch) {
            fileSuffix2 = suffixExtractMatch[0].replace(/"/g, '');
        } else {
            fileSuffix2 = ".js";
        }

        chunkEntries2.forEach(entry => {
          const [chunkName2, hash2] = entry.replace(/"/g, '').split(':').map(s => s.trim());
          const jsPath = `${basePath}${chunkName2}.${hash2}${fileSuffix2}`;
          const fullUrl = buildFullUrl(jsPath);
          if (!loadedFiles.has(fullUrl)) {
            unloadedFiles.add(fullUrl);
          }
        });
      }
    };

    // 收集和分析脚本
    const scripts = document.getElementsByTagName('script');
    const scriptSrcs = new Set();
    const inlineContents = [];

    // 首先收集所有脚本源和内联内容，避免重复处理
    for (const script of scripts) {
      const src = script.src;
      if (src && src.includes('.js')) {
        loadedFiles.add(src);
        scriptSrcs.add(src);
      }

      if (script.textContent && script.textContent.trim().length > 0) {
        inlineContents.push(script.textContent);
      }
    }

    // 处理内联脚本，这些可以立即分析
    inlineContents.forEach(content => {
      analyzeScriptContent(content);
    });

    // 如果不需要获取外部脚本内容，直接返回结果
    if (!shouldFetchScripts) {
      return Promise.resolve({
        files: Array.from(unloadedFiles),
        loadedFiles: Array.from(loadedFiles),
        debug: {
          loadedCount: loadedFiles.size,
          unloadedCount: unloadedFiles.size
        }
      });
    }

    // 使用Promise.all并行获取所有外部脚本
    const fetchPromises = Array.from(scriptSrcs).map(src =>
      fetch(src)
        .then(response => response.text())
        .then(content => {
          analyzeScriptContent(content);
        })
        .catch(error => {
          console.error('获取脚本内容失败:', src, error);
        })
    );

    // 等待所有脚本获取和分析完成
    return Promise.all(fetchPromises).then(() => {
      return {
        files: Array.from(unloadedFiles),
        loadedFiles: Array.from(loadedFiles),
        debug: {
          loadedCount: loadedFiles.size,
          unloadedCount: unloadedFiles.size
        }
      };
    });

  } catch (error) {
    console.error('查找Webpack文件时出错：', error);
    return Promise.reject({
      files: [],
      error: error.message || '查找文件时发生错误'
    });
  }
}

// 添加访问状态跟踪
let isVisiting = false;
let visitingIframe = null;
const visitedFiles = new Set();

// 缓存上次检测结果
let lastDetectionResult = null;

// 并行请求配置
const PARALLEL_REQUESTS = 10; // 同时进行的请求数量
const REQUEST_DELAY = 10;     // 请求之间的延迟时间（毫秒）
const USE_HEAD_REQUEST = false; // 是否使用HEAD请求代替完整获取

// 添加敏感信息扫描函数
async function scanForSensitiveInfo(files) {
  try {
    // 定义新的正则规则
    const rules = [
      {
        name: '邮箱',
        regex: /(?<![\w.-])[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(?!js|css|jpg|jpeg|png|ico)[a-zA-Z]{2,}(?![\w.-])/gi,
        severity: '中危'
      },
      {
        name: 'Oss云存储桶',
        regex: /(?:[A|a]ccess[K|k]ey(?:[I|i]d|[S|s]ecret)|[A|a]ccess[-_]?[Kk]ey)\s*[:=]\s*['"]?([0-9a-fA-F\-_=]{6,128})['"]?/gi,
        severity: '中危'
      },
      {
        name: '阿里云OSS URL',
        regex: /(?<!\w)[a-zA-Z0-9-]+\.oss[-\w]*\.aliyuncs\.com(?!\w)/gi,
        severity: '中危'
      },
      {
        name: 'JSON Web Token',
        regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}\.?[A-Za-z0-9-_.+/=]*/gi,
        severity: '高危'
      },
      {
        name: 'Basic Auth凭据',
        regex: /(?<=:\/\/)[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+@(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/gi,
        severity: '高危'
      },
      {
        name: 'Github凭据',
        regex: /(?:github(?:[-_]?token)?\s*[:=]\s*['"]?(gh[psuro]_[0-9a-zA-Z]{36})['"]?)/gi,
        severity: '中危'
      },
      {
        name: 'LinkedIn密钥',
        regex: /(?:linkedin[-_]?secret\s*[:=]\s*['"][0-9a-zA-Z]{16}['"])/gi,
        severity: '高危'
      },
      {
        name: '国内手机号码',
        regex: /(?<!\d)((?:\+86|0086)?1[3-9]\d{9})(?!\d)/g,
        severity: '高危'
      },
      {
        name: '身份证号码',
        regex: /(?<!\d)(?!0{6,}|1{6,})([1-6]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dxX])(?!\d)/g,
        severity: '高危'
      },
      {
        name: '敏感配置信息',
        regex: /(?:[\{,]?\s*)((appkey|secret|token|auth|access|admin|VideoWebPlugin|playMode|snapDir|SnapDir|videoDir|encryptedFields))([\w]*)\s*:\s*([^,\}\s]+|["'](.*?)["'])/gi,
        severity: '高危'
      },
      {
        name: '密码',
        regex: /(?:['"]?[\w]{0,10}[p](?:ass|wd|asswd|assword)[\w]{0,10}['"]?)[:=]\s*['"](?!null|undefined)(.*?)['"]/gi,
        severity: '高危'
      }
    ];

    const results = [];
    
    // 并行扫描文件
    const scanPromises = files.map(file => scanFileWithNewRules(file, rules));
    const fileResults = await Promise.all(scanPromises);
    
    // 过滤掉没有匹配结果的文件
    const filteredResults = fileResults.filter(result => result && result.matches && result.matches.length > 0);
    
    // 重组结果：按规则类型分组
    const groupedResults = groupResultsBySeverity(filteredResults);
    
    return groupedResults;
  } catch (error) {
    console.error('扫描敏感信息时出错:', error);
    throw error;
  }
}

// 使用新规则扫描文件
async function scanFileWithNewRules(file, rules) {
  try {
    const response = await fetch(file);
    const content = await response.text();
    
    const matches = [];
    
    for (const rule of rules) {
      try {
        // 重置正则表达式的lastIndex
        rule.regex.lastIndex = 0;
        
        let match;
        while ((match = rule.regex.exec(content)) !== null) {
          matches.push({
            ruleName: rule.name,
            ruleType: rule.severity,
            match: match[0]
          });
        }
      } catch (e) {
        console.error(`规则 "${rule.name}" 的正则表达式无效:`, rule.regex, e);
      }
    }
    
    if (matches.length === 0) return null;
    
    return {
      file,
      matches
    };
  } catch (error) {
    console.error(`扫描文件 ${file} 时出错:`, error);
    return null;
  }
}

// 按严重程度分组结果
function groupResultsBySeverity(results) {
  const grouped = {
    '高危': [],
    '中危': [],
    '低危': [],
    '信息': []
  };
  
  results.forEach(result => {
    result.matches.forEach(match => {
      const severity = match.ruleType;
      if (grouped[severity]) {
        // 检查是否已有相同规则的分组
        let ruleGroup = grouped[severity].find(g => g.ruleName === match.ruleName);
        
        if (!ruleGroup) {
          ruleGroup = {
            ruleName: match.ruleName,
            ruleType: severity,
            files: []
          };
          grouped[severity].push(ruleGroup);
        }
        
        // 检查文件是否已存在
        let fileEntry = ruleGroup.files.find(f => f.file === result.file);
        if (!fileEntry) {
          fileEntry = {
            file: result.file,
            matches: []
          };
          ruleGroup.files.push(fileEntry);
        }
        
        // 添加匹配内容
        fileEntry.matches.push(match.match);
      }
    });
  });
  
  // 转换为数组格式
  return Object.entries(grouped)
    .filter(([severity, groups]) => groups.length > 0)
    .map(([severity, groups]) => ({
      severity,
      groups
    }));
}

// 修改消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getUnloadedFiles') {
    // 如果有缓存的结果且不是强制刷新，直接返回缓存结果
    if (lastDetectionResult && !request.forceRefresh) {
      sendResponse(lastDetectionResult);
      return true;
    }

    // 默认不获取外部脚本内容，只分析内联脚本
    findWebpackChunks(false)
      .then(result => {
        // 缓存检测结果
        lastDetectionResult = result;
        sendResponse(result);
      })
      .catch(error => {
        console.error('处理消息时出错：', error);
        sendResponse({
          files: [],
          error: error.message || '处理消息时发生错误'
        });
      });
    return true;
  } else if (request.action === 'analyzeExternalScripts') {
    // 新增消息类型，用于分析外部脚本
    findWebpackChunks(true)
      .then(result => {
        // 更新缓存结果
        lastDetectionResult = result;
        sendResponse(result);
      })
      .catch(error => {
        console.error('分析外部脚本时出错：', error);
        sendResponse({
          files: [],
          error: error.message || '分析外部脚本时发生错误'
        });
      });
    return true;
  } else if (request.action === 'visitFiles') {
    try {
      // 如果正在访问，先停止当前的访问
      if (isVisiting) {
        isVisiting = false;
        if (visitingIframe) {
          document.body.removeChild(visitingIframe);
          visitingIframe = null;
        }
        return true;
      }

      // 如果请求中包含 resetVisited 为 true，则清空 visitedFiles
      if (request.resetVisited) {
        visitedFiles.clear();
      }

      // 过滤出未访问的文件
      const files = request.files.filter(file => !visitedFiles.has(file));

      // 如果所有文件都已访问过，发送通知
      if (files.length === 0) {
        chrome.runtime.sendMessage({
          action: 'visitComplete',
          totalFiles: 0,
          alreadyVisited: true
        });
        return true;
      }

      // 开始新的访问
      isVisiting = true;

      // 创建进度通知函数
      const notifyProgress = (processed, total) => {
        chrome.runtime.sendMessage({
          action: 'visitProgress',
          processed,
          total,
          percentage: Math.round((processed / total) * 100)
        });
      };

      // 使用优化的并行请求机制
      visitFilesParallel(files)
        .then(result => {
          // 通知popup访问完成
          chrome.runtime.sendMessage({
            action: 'visitComplete',
            totalFiles: files.length,
            alreadyVisited: false,
            successCount: result.successCount,
            failureCount: result.failureCount
          });
        })
        .catch(error => {
          console.error('访问文件时出错：', error);
          chrome.runtime.sendMessage({
            action: 'visitError',
            error: error.message || '访问文件时发生错误'
          });
        })
        .finally(() => {
          isVisiting = false;
        });

      return true;
    } catch (error) {
      console.error('访问文件时出错：', error);
      isVisiting = false;
      chrome.runtime.sendMessage({
        action: 'visitError',
        error: error.message || '访问文件时发生错误'
      });
    }
    return true;
  } else if (request.action === 'stopVisiting') {
    isVisiting = false;
    if (visitingIframe) {
      document.body.removeChild(visitingIframe);
      visitingIframe = null;
    }
  } else if (request.action === 'clearCache') {
    // 添加清除缓存的功能
    lastDetectionResult = null;
    sendResponse({ success: true });
    return true;
  } else if (request.action === 'scanSensitiveInfo') {
    // 处理敏感信息扫描请求
    scanForSensitiveInfo(request.files)
      .then(results => {
        sendResponse({ results });
      })
      .catch(error => {
        sendResponse({ 
          error: error.message || '扫描敏感信息时出错' 
        });
      });
    return true;
  }
  return true;
});

// 优化的并行文件访问函数
function visitFilesParallel(files) {
  return new Promise((resolve, reject) => {
    if (!isVisiting) {
      reject(new Error('访问已停止'));
      return;
    }

    // 创建隐藏的iframe（仅创建一次）
    if (!visitingIframe) {
      visitingIframe = document.createElement('iframe');
      visitingIframe.style.display = 'none';
      document.body.appendChild(visitingIframe);
    }

    let currentIndex = 0;
    let activeRequests = 0;
    let successCount = 0;
    let failureCount = 0;
    let lastProgressNotification = 0;

    // 通知初始进度
    chrome.runtime.sendMessage({
      action: 'visitProgress',
      processed: 0,
      total: files.length,
      percentage: 0
    });

    // 启动初始批次的请求
    for (let i = 0; i < PARALLEL_REQUESTS && currentIndex < files.length; i++) {
      processNextFile();
    }

    function processNextFile() {
      if (!isVisiting) {
        // 如果停止访问，清理并返回
        if (visitingIframe) {
          document.body.removeChild(visitingIframe);
          visitingIframe = null;
        }
        resolve({ successCount, failureCount });
        return;
      }

      if (currentIndex >= files.length) {
        // 如果没有更多文件要处理，检查是否所有请求都已完成
        if (activeRequests === 0) {
          // 所有请求完成，清理并返回
          if (visitingIframe) {
            document.body.removeChild(visitingIframe);
            visitingIframe = null;
          }
          resolve({ successCount, failureCount });
        }
        return;
      }

      const file = files[currentIndex++];
      activeRequests++;

      // 使用HEAD请求或GET请求
      const requestMethod = USE_HEAD_REQUEST ? 'HEAD' : 'GET';

      fetch(file, { method: requestMethod })
        .then(response => {
          if (response.ok) {
            // 文件访问成功
            visitedFiles.add(file);
            successCount++;
          } else {
            // 文件访问失败
            failureCount++;
          }
        })
        .catch(error => {
          console.error('访问文件失败:', file, error);
          failureCount++;
        })
        .finally(() => {
          activeRequests--;

          // 计算总进度
          const processed = currentIndex - activeRequests;

          // 只在进度变化显著时发送通知（至少1%的变化）
          const currentPercentage = Math.round((processed / files.length) * 100);
          const lastPercentage = Math.round((lastProgressNotification / files.length) * 100);

          if (currentPercentage > lastPercentage) {
            lastProgressNotification = processed;
            // 通知进度
            chrome.runtime.sendMessage({
              action: 'visitProgress',
              processed,
              total: files.length,
              percentage: currentPercentage
            });
          }

          // 延迟启动下一个请求
          setTimeout(() => {
            processNextFile();
          }, REQUEST_DELAY);
        });
    }
  });
}