let customPrefix = '';
let findText = '';
let replaceText = '';
let isFirstLoad = true;
let scanCache = null; // 缓存扫描结果

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      showError('无法获取当前标签页信息');
      return;
    }

    if (!tab.url || tab.url.startsWith('chrome://')) {
      showError('此页面不支持检查Webpack文件');
      return;
    }

    // 显示加载指示器
    const fileList = document.getElementById('file-list');
    fileList.innerHTML = '<div class="loading">正在分析页面中的Webpack文件...</div>';

    // 从存储加载缓存
    const scanStorageKey = `scanCache_${tab.id}_${encodeURIComponent(tab.url)}`;
    const cachedData = await chrome.storage.local.get(scanStorageKey);
    scanCache = cachedData[scanStorageKey] || null;

    // 只在首次加载时注入脚本，避免重复注入
    if (isFirstLoad) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/content.js']
        });
        isFirstLoad = false;
      } catch (error) {
        console.error('注入脚本失败:', error);
      }
    }

    let currentResponse = null;
    const showLoadedCheckbox = document.getElementById('show-loaded');

    const prefixInput = document.getElementById('custom-prefix');
    const applyPrefixBtn = document.getElementById('apply-prefix');
    
    applyPrefixBtn.addEventListener('click', () => {
      customPrefix = prefixInput.value.trim();
      applyPrefixBtn.textContent = '已应用';
      applyPrefixBtn.classList.add('active');
      setTimeout(() => {
        applyPrefixBtn.textContent = '应用';
        applyPrefixBtn.classList.remove('active');
      }, 1000);
      
      if (currentResponse) {
        updateFileList(currentResponse, showLoadedCheckbox.checked, tab);
      }
    });

    // 新增的查找替换功能
    const findInput = document.getElementById('find-text');
    const replaceInput = document.getElementById('replace-text');
    const applyReplaceBtn = document.getElementById('apply-replace');
    
    applyReplaceBtn.addEventListener('click', () => {
      findText = findInput.value.trim();
      replaceText = replaceInput.value.trim();
      applyReplaceBtn.textContent = '已替换';
      applyReplaceBtn.classList.add('active');
      setTimeout(() => {
        applyReplaceBtn.textContent = '替换';
        applyReplaceBtn.classList.remove('active');
      }, 1000);
      
      if (currentResponse) {
        updateFileList(currentResponse, showLoadedCheckbox.checked, tab);
      }
    });

    // 添加深度分析按钮功能
    const analyzeBtn = document.getElementById('analyze-btn');
    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', () => {
        // 清除缓存
        scanCache = null;
        chrome.storage.local.remove(scanStorageKey);
        
        analyzeBtn.textContent = '正在分析...';
        analyzeBtn.disabled = true;
        fileList.innerHTML = '<div class="loading">正在深度分析外部脚本，这可能需要一些时间...</div>';
        
        // 发送消息分析外部脚本
        chrome.tabs.sendMessage(tab.id, { action: 'analyzeExternalScripts' }, (response) => {
          handleResponse(response);
          analyzeBtn.textContent = '深度分析';
          analyzeBtn.disabled = false;
        });
      });
    }

    // 添加敏感信息检测按钮功能
    const scanBtn = document.getElementById('scan-btn');
    if (scanBtn) {
      scanBtn.addEventListener('click', async () => {
        // 检查是否有缓存
        if (scanCache) {
          // 直接使用缓存结果
          document.getElementById('scan-results').style.display = 'block';
          document.getElementById('file-list').style.display = 'none';
          updateScanResults(scanCache);
          scanBtn.textContent = '检测敏感信息';
          return;
        }
        
        scanBtn.textContent = '正在检测...';
        scanBtn.disabled = true;
        
        // 显示扫描面板
        document.getElementById('scan-results').style.display = 'block';
        document.getElementById('file-list').style.display = 'none';
        
        // 获取所有JS文件（包括已加载和未加载的）
        const response = await new Promise(resolve => {
          chrome.tabs.sendMessage(tab.id, { action: 'getUnloadedFiles' }, resolve);
        });
        
        if (response.error) {
          showScanError(response.error);
          return;
        }
        
        // 合并所有JS文件（包括已加载和未加载的）
        const allFiles = [...response.files, ...response.loadedFiles];
        
        // 发送消息开始扫描
        chrome.tabs.sendMessage(tab.id, { 
          action: 'scanSensitiveInfo', 
          files: allFiles 
        }, (scanResponse) => {
          handleScanResponse(scanResponse);
          // 缓存扫描结果
          if (scanResponse && scanResponse.results) {
            scanCache = scanResponse.results;
            chrome.storage.local.set({ [scanStorageKey]: scanResponse.results });
          }
        });
      });
    }

    // 添加关闭扫描结果按钮功能
    const closeScanResults = document.getElementById('close-scan-results');
    if (closeScanResults) {
      closeScanResults.addEventListener('click', () => {
        document.getElementById('scan-results').style.display = 'none';
        document.getElementById('file-list').style.display = 'block';
        const scanBtn = document.getElementById('scan-btn');
        if (scanBtn) {
          scanBtn.textContent = '检测敏感信息';
          scanBtn.disabled = false;
        }
      });
    }

    // 添加刷新按钮功能
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        // 清除缓存
        scanCache = null;
        chrome.storage.local.remove(scanStorageKey);
        
        refreshBtn.textContent = '正在刷新...';
        refreshBtn.disabled = true;
        
        // 清除缓存并强制刷新
        chrome.tabs.sendMessage(tab.id, { action: 'clearCache' }, () => {
          chrome.tabs.sendMessage(tab.id, { action: 'getUnloadedFiles', forceRefresh: true }, handleResponse);
        });
      });
    }

    function getProcessedUrl(url) {
      // 应用自定义前缀
      let processedUrl = url;
      if (customPrefix) {
        try {
          const urlObj = new URL(url);
          processedUrl = customPrefix + urlObj.pathname + urlObj.search + urlObj.hash;
        } catch (e) {
          processedUrl = customPrefix + url;
        }
      }
      
      // 应用查找替换
      if (findText) {
        try {
          processedUrl = processedUrl.replaceAll(findText, replaceText);
        } catch (e) {
          console.error('替换URL时出错:', e);
        }
      }
      
      return processedUrl;
    }

    function updateFileList(response, showLoaded, tab) {
      const fileList = document.getElementById('file-list');
      
      const statsHtml = `
        <div class="stats">
          <span class="stat-item">已加载文件: ${response.debug.loadedCount || 0}</span>
          <span class="stat-item">未加载文件: ${response.debug.unloadedCount || 0}</span>
        </div>
      `;
      
      fileList.innerHTML = statsHtml;

      const filesContainer = document.createElement('div');
      filesContainer.className = 'files-container';

      // 过滤有效的 JavaScript 文件 URL
      const filesToShow = (showLoaded ? response.loadedFiles : response.files).filter(file => {
        try {
          const urlObj = new URL(file);
          const pathname = urlObj.pathname;
          // 检查 URL 是否以 .js 结尾
          if (!pathname.endsWith('.js')) return false;
          // 提取文件名（去掉路径和 .js 扩展名）
          const fileName = pathname.split('/').pop().replace('.js', '');
          // 确保文件名只包含字母、数字、连字符、下划线或点号，且不包含代码相关模式
          const isValidFileName = /^[a-zA-Z0-9-_.]+$/.test(fileName);
          // 检查 URL 是否包含代码片段或关键字
          const isNotCodeSnippet = !/[{}=]/.test(file) && !/(function|typeof|Object|Array|Promise)/i.test(file);
          return isValidFileName && isNotCodeSnippet;
        } catch (e) {
          return false; // 无效 URL
        }
      });
      
      if (filesToShow && filesToShow.length > 0) {
        const actionDiv = document.createElement('div');
        actionDiv.className = 'action-buttons';
        
        const copyAllBtn = document.createElement('button');
        copyAllBtn.className = 'btn btn-success';
        copyAllBtn.textContent = '复制所有 URL';
        copyAllBtn.onclick = () => {
          const allUrls = filesToShow.map(file => getProcessedUrl(file)).join('\n');
          navigator.clipboard.writeText(allUrls).then(() => {
            copyAllBtn.textContent = '已复制';
            setTimeout(() => copyAllBtn.textContent = '复制所有 URL', 1000);
          });
        };
        actionDiv.appendChild(copyAllBtn);

        if (!showLoaded) {
          const visitAllBtn = document.createElement('button');
          visitAllBtn.className = 'btn btn-info visit-all-btn';
          visitAllBtn.textContent = '访问所有文件';
          const stopVisitBtn = document.createElement('button');
          stopVisitBtn.className = 'btn btn-danger stop-visit-btn';
          stopVisitBtn.textContent = '停止访问';
          stopVisitBtn.style.display = 'none';

          // 添加进度条容器
          const progressContainer = document.createElement('div');
          progressContainer.className = 'progress-container';
          progressContainer.style.display = 'none';
          
          const progressBar = document.createElement('div');
          progressBar.className = 'progress-bar';
          progressBar.style.width = '0%';
          
          const progressText = document.createElement('div');
          progressText.className = 'progress-text';
          progressText.textContent = '0%';
          
          progressContainer.appendChild(progressBar);
          progressContainer.appendChild(progressText);
          
          actionDiv.appendChild(progressContainer);

          visitAllBtn.onclick = () => {
            if (visitAllBtn.textContent === '正在访问...') {
              chrome.tabs.sendMessage(tab.id, { action: 'stopVisiting' });
              visitAllBtn.textContent = '访问已停止';
              stopVisitBtn.style.display = 'none';
              progressContainer.style.display = 'none';
              setTimeout(() => visitAllBtn.textContent = '访问所有文件', 1000);
            } else {
              const urlsToVisit = filesToShow.map(file => getProcessedUrl(file));
              chrome.tabs.sendMessage(tab.id, { action: 'visitFiles', files: urlsToVisit, resetVisited: true });
              visitAllBtn.textContent = '正在访问...';
              stopVisitBtn.style.display = 'inline-block';
              
              progressContainer.style.display = 'block';
              progressBar.style.width = '0%';
              progressText.textContent = '0%';
            }
          };

          stopVisitBtn.onclick = () => {
            chrome.tabs.sendMessage(tab.id, { action: 'stopVisiting' });
            visitAllBtn.textContent = '访问已停止';
            stopVisitBtn.style.display = 'none';
            progressContainer.style.display = 'none';
            setTimeout(() => visitAllBtn.textContent = '访问所有文件', 1000);
          };

          actionDiv.appendChild(visitAllBtn);
          actionDiv.appendChild(stopVisitBtn);
        }
        
        fileList.appendChild(actionDiv);

        // 使用文档片段优化DOM操作
        const fragment = document.createDocumentFragment();
        const table = document.createElement('table');
        table.className = 'files-table';
        table.innerHTML = `
          <thead>
            <tr>
              <th>File Path</th>
              <th style="width: 120px;">Actions</th>
            </tr>
          </thead>
          <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');
        
        // 批量创建行元素，减少DOM重绘
        filesToShow.forEach(file => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td class="file-name">${getProcessedUrl(file)}</td>
            <td>
              <button class="btn btn-primary copy-btn">复制</button>
              ${!showLoaded ? '<button class="btn btn-info visit-btn">访问</button>' : ''}
            </td>
          `;

          const copyBtn = tr.querySelector('.copy-btn');
          copyBtn.onclick = () => {
            navigator.clipboard.writeText(getProcessedUrl(file)).then(() => {
              copyBtn.textContent = '已复制';
              setTimeout(() => copyBtn.textContent = '复制', 1000);
            });
          };

          if (!showLoaded) {
            const visitBtn = tr.querySelector('.visit-btn');
            visitBtn.onclick = () => {
              if (visitBtn.textContent === '正在访问...') {
                chrome.tabs.sendMessage(tab.id, { action: 'stopVisiting' });
                visitBtn.textContent = '已停止';
              } else {
                chrome.tabs.sendMessage(tab.id, { action: 'visitFiles', files: [getProcessedUrl(file)], resetVisited: true });
                visitBtn.textContent = '正在访问...';
              }
              setTimeout(() => visitBtn.textContent = '访问', 1000);
            };
          }

          fragment.appendChild(tr);
        });
        
        tbody.appendChild(fragment);
        filesContainer.appendChild(table);
      } else {
        filesContainer.innerHTML = `
          <div class="no-files">
            ${showLoaded ? '没有找到已加载的 Webpack JS 文件' : '没有找到未加载的 Webpack JS 文件'}
          </div>
        `;
      }
      
      fileList.appendChild(filesContainer);
      
      // 如果有刷新按钮，重置其状态
      const refreshBtn = document.getElementById('refresh-btn');
      if (refreshBtn) {
        refreshBtn.textContent = '刷新';
        refreshBtn.disabled = false;
      }
    }

    // 处理响应的函数
    function handleResponse(response) {
      if (chrome.runtime.lastError) {
        showError(`无法连接到页面: ${chrome.runtime.lastError.message || '未知错误'}`);
        return;
      }

      if (!response) {
        showError('未收到页面响应');
        return;
      }

      if (response.error) {
        showError('获取文件列表时出错: ' + response.error);
        return;
      }

      currentResponse = response;
      updateFileList(response, showLoadedCheckbox.checked, tab);
    }

    // 处理扫描响应的函数
    function handleScanResponse(response) {
      const scanBtn = document.getElementById('scan-btn');
      if (scanBtn) {
        scanBtn.textContent = '检测敏感信息';
        scanBtn.disabled = false;
      }
      
      if (chrome.runtime.lastError) {
        showScanError(`无法连接到页面: ${chrome.runtime.lastError.message || '未知错误'}`);
        return;
      }

      if (!response) {
        showScanError('未收到扫描响应');
        return;
      }

      if (response.error) {
        showScanError('扫描时出错: ' + response.error);
        return;
      }

      updateScanResults(response.results);
    }

    function updateScanResults(results) {
      const scanResultsContent = document.getElementById('scan-results-content');
      
      if (!results || results.length === 0) {
        scanResultsContent.innerHTML = '<div class="no-results">未检测到敏感信息</div>';
        return;
      }

      // 创建结果容器
      const fragment = document.createDocumentFragment();
      
      // 遍历每个严重程度分组
      results.forEach(severityGroup => {
        const severity = severityGroup.severity;
        const groups = severityGroup.groups;
        
        // 创建严重程度分组容器
        const severityContainer = document.createElement('div');
        severityContainer.className = 'severity-group';
        
        // 严重程度标题
        const severityHeader = document.createElement('div');
        severityHeader.className = 'severity-header';
        severityHeader.innerHTML = `
          <div>
            <span class="collapse-arrow">▶</span>
            <h2 class="severity-title">${severity}</h2>
          </div>
          <div class="severity-badge ${getSeverityClass(severity)}">${severity}</div>
        `;
        severityContainer.appendChild(severityHeader);
        
        // 创建规则分组容器（默认隐藏）
        const ruleGroupsContainer = document.createElement('div');
        ruleGroupsContainer.className = 'rule-groups-container';
        ruleGroupsContainer.style.display = 'none';
        
        // 遍历该严重程度下的每个规则分组
        groups.forEach(ruleGroup => {
          const ruleContainer = document.createElement('div');
          ruleContainer.className = 'rule-group';
          
          // 规则标题
          const ruleHeader = document.createElement('div');
          ruleHeader.className = 'rule-header';
          ruleHeader.innerHTML = `
            <div>
              <span class="collapse-arrow">▶</span>
              <h3 class="rule-name">${ruleGroup.ruleName}</h3>
            </div>
            <span class="rule-count">${ruleGroup.files.length}个文件</span>
          `;
          ruleContainer.appendChild(ruleHeader);
          
          // 文件列表容器（默认隐藏）
          const filesContainer = document.createElement('div');
          filesContainer.className = 'rule-files';
          filesContainer.style.display = 'none';
          
          // 计算总匹配数
          let totalMatches = 0;
          ruleGroup.files.forEach(fileGroup => {
            totalMatches += fileGroup.matches.length;
          });
          
          ruleGroup.files.forEach(fileGroup => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            
            // 文件路径
            const filePath = document.createElement('div');
            filePath.className = 'file-path';
            filePath.innerHTML = `
              <div>
                <span class="collapse-arrow">▶</span>
                <span class="file-path-text">${fileGroup.file}</span>
              </div>
              <span class="file-match-count">${fileGroup.matches.length}个匹配</span>
            `;
            fileItem.appendChild(filePath);
            
            // 匹配内容容器（默认隐藏）
            const matchesContainer = document.createElement('div');
            matchesContainer.className = 'matches-container';
            matchesContainer.style.display = 'none';
            
            fileGroup.matches.forEach(match => {
              const matchItem = document.createElement('div');
              matchItem.className = 'match-item';
              matchItem.innerHTML = `
                <span class="match-text">${match}</span>
                <button class="copy-match-btn">复制</button>
              `;
              
              // 添加复制功能
              const copyBtn = matchItem.querySelector('.copy-match-btn');
              copyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(match).then(() => {
                  copyBtn.textContent = '已复制';
                  setTimeout(() => copyBtn.textContent = '复制', 1000);
                });
              });
              
              matchesContainer.appendChild(matchItem);
            });
            
            fileItem.appendChild(matchesContainer);
            filesContainer.appendChild(fileItem);
          });
          
          ruleContainer.appendChild(filesContainer);
          ruleGroupsContainer.appendChild(ruleContainer);
        });
        
        severityContainer.appendChild(ruleGroupsContainer);
        fragment.appendChild(severityContainer);
      });
      
      scanResultsContent.innerHTML = '';
      scanResultsContent.appendChild(fragment);
      
      // 添加折叠功能
      addCollapseFunctionality();
    }
    
    // 添加折叠功能
    function addCollapseFunctionality() {
      // 严重程度分组折叠
      const severityHeaders = document.querySelectorAll('.severity-header');
      severityHeaders.forEach(header => {
        header.addEventListener('click', (e) => {
          // 只处理标题点击，避免复制按钮等子元素触发
          if (e.target.classList.contains('copy-match-btn')) return;
          
          const container = header.nextElementSibling;
          const arrow = header.querySelector('.collapse-arrow');
          
          if (container.style.display === 'none') {
            // 展开规则分组容器
            container.style.display = 'block';
            arrow.classList.add('down');
            
            // 展开该严重程度分组下的所有规则分组
            const ruleGroups = container.querySelectorAll('.rule-group');
            ruleGroups.forEach(ruleGroup => {
              const ruleHeader = ruleGroup.querySelector('.rule-header');
              const ruleFiles = ruleGroup.querySelector('.rule-files');
              
              // 展开规则分组
              ruleFiles.style.display = 'block';
              ruleHeader.querySelector('.collapse-arrow').classList.add('down');
              
              // 展开规则分组下的所有文件分组
              const fileItems = ruleFiles.querySelectorAll('.file-item');
              fileItems.forEach(fileItem => {
                const filePath = fileItem.querySelector('.file-path');
                const matchesContainer = fileItem.querySelector('.matches-container');
                
                // 展开文件分组
                matchesContainer.style.display = 'block';
                filePath.querySelector('.collapse-arrow').classList.add('down');
              });
            });
          } else {
            // 折叠规则分组容器
            container.style.display = 'none';
            arrow.classList.remove('down');
          }
        });
      });
      
      // 规则分组折叠
      const ruleHeaders = document.querySelectorAll('.rule-header');
      ruleHeaders.forEach(header => {
        header.addEventListener('click', (e) => {
          if (e.target.classList.contains('copy-match-btn')) return;
          
          const filesContainer = header.nextElementSibling;
          const arrow = header.querySelector('.collapse-arrow');
          
          if (filesContainer.style.display === 'none') {
            filesContainer.style.display = 'block';
            arrow.classList.add('down');
          } else {
            filesContainer.style.display = 'none';
            arrow.classList.remove('down');
          }
        });
      });
      
      // 文件项折叠
      const filePaths = document.querySelectorAll('.file-path');
      filePaths.forEach(path => {
        path.addEventListener('click', (e) => {
          if (e.target.classList.contains('copy-match-btn')) return;
          
          const matchesContainer = path.nextElementSibling;
          const arrow = path.querySelector('.collapse-arrow');
          
          if (matchesContainer.style.display === 'none') {
            matchesContainer.style.display = 'block';
            arrow.classList.add('down');
          } else {
            matchesContainer.style.display = 'none';
            arrow.classList.remove('down');
          }
        });
      });
    }

    function getSeverityClass(severity) {
      switch (severity) {
        case '高危': return 'critical';
        case '中危': return 'warning';
        case '低危': return 'info';
        default: return 'info';
      }
    }

    function showScanError(message) {
      const scanResultsContent = document.getElementById('scan-results-content');
      scanResultsContent.innerHTML = `<div class="error">${message}</div>`;
      const scanBtn = document.getElementById('scan-btn');
      if (scanBtn) {
        scanBtn.textContent = '检测敏感信息';
        scanBtn.disabled = false;
      }
    }

    // 发送消息获取未加载文件（不获取外部脚本内容）
    chrome.tabs.sendMessage(tab.id, { action: 'getUnloadedFiles' }, handleResponse);

    showLoadedCheckbox.addEventListener('change', () => {
      if (currentResponse) {
        updateFileList(currentResponse, showLoadedCheckbox.checked, tab);
      }
    });

  } catch (error) {
    console.error('Popup Error:', error);
    showError(error.message || '发生未知错误');
  }
});

function showError(message) {
  console.error('Error:', message);
  const fileList = document.getElementById('file-list');
  if (fileList) {
    fileList.innerHTML = `<div class="error">${message}</div>`;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'visitComplete') {
    const visitAllBtn = document.querySelector('.visit-all-btn');
    const stopVisitBtn = document.querySelector('.stop-visit-btn');
    const progressContainer = document.querySelector('.progress-container');
    
    if (visitAllBtn) {
      if (request.alreadyVisited) {
        visitAllBtn.textContent = '文件已全部访问过';
        setTimeout(() => visitAllBtn.textContent = '访问所有文件', 1000);
      } else {
        visitAllBtn.textContent = `已访问 ${request.totalFiles} 个文件`;
        
        // 更新进度条为100%
        if (progressContainer) {
          const progressBar = progressContainer.querySelector('.progress-bar');
          const progressText = progressContainer.querySelector('.progress-text');
          
          if (progressBar && progressText) {
            progressBar.style.width = '100%';
            progressText.textContent = '100%';
          }
        }
      }
      
      if (stopVisitBtn) {
        stopVisitBtn.style.display = 'none';
      }
      
      // 延迟隐藏进度条
      setTimeout(() => {
        if (progressContainer) {
          progressContainer.style.display = 'none';
        }
        visitAllBtn.textContent = '访问所有文件';
      }, 2000);
    }
  } else if (request.action === 'visitProgress') {
    // 处理进度更新
    const progressContainer = document.querySelector('.progress-container');
    if (progressContainer) {
      const progressBar = progressContainer.querySelector('.progress-bar');
      const progressText = document.querySelector('.progress-text');
      
      if (progressBar && progressText) {
        progressBar.style.width = `${request.percentage}%`;
        progressText.textContent = `${request.percentage}% (${request.processed}/${request.total})`;
      }
    }
  } else if (request.action === 'visitError') {
    // 处理访问错误
    const visitAllBtn = document.querySelector('.visit-all-btn');
    const stopVisitBtn = document.querySelector('.stop-visit-btn');
    const progressContainer = document.querySelector('.progress-container');
    
    if (visitAllBtn) {
      visitAllBtn.textContent = '访问出错';
      setTimeout(() => visitAllBtn.textContent = '访问所有文件', 2000);
    }
    
    if (stopVisitBtn) {
      stopVisitBtn.style.display = 'none';
    }
    
    if (progressContainer) {
      progressContainer.style.display = 'none';
    }
    
    showError(`访问文件时出错: ${request.error}`);
  }
});