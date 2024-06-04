let myToken = 'passwd';

export default {
  async fetch(request, env) {
    try {
      myToken = env.TOKEN || myToken;

      let KV;
      if (env.KV) {
        KV = env.KV;
      } else {
        return new Response('KV 命名空间未绑定', {
          status: 400,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }

      const url = new URL(request.url);
      let token = url.searchParams.get('token') || "null";
      if (url.pathname === `/${myToken}`) {
        token = myToken;
      }

      if (token === myToken) {
        const filename = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;

        if (filename === "config" || filename === myToken) {
          const html = generateConfigHTML(url.hostname, token);
          return new Response(html, {
            headers: { 'Content-Type': 'text/html; charset=UTF-8' },
          });
        } else if (filename === "config/update.bat") {
          return new Response(generateBatScript(url.hostname, token), {
            headers: {
              "Content-Disposition": `attachment; filename=update.bat`,
              "content-type": "text/plain; charset=utf-8",
            },
          });
        } else if (filename === "config/update.sh") {
          return new Response(generateShScript(url.hostname, token), {
            headers: {
              "Content-Disposition": `attachment; filename=update.sh`,
              "content-type": "text/plain; charset=utf-8",
            },
          });
        } else {
          const text = url.searchParams.get('text') || "null";
          const b64 = url.searchParams.get('b64') || "null";

          if (text === "null" && b64 === "null") {
            const value = await KV.get(filename);
            return new Response(value, {
              status: 200,
              headers: { 'content-type': 'text/plain; charset=utf-8' },
            });
          } else {
            const content = b64 !== "null" ? decodeBase64(replaceSpacesWithPlus(b64)) : text;
            await KV.put(filename, content);
            return new Response(content, {
              status: 200,
              headers: { 'content-type': 'text/plain; charset=utf-8' },
            });
          }
        }
      } else if (url.pathname === "/") {
        return new Response(`
          <!DOCTYPE html>
          <html>
          <head>
          <title>Welcome to nginx!</title>
          <style>
            body {
              width: 35em;
              margin: 0 auto;
              font-family: Tahoma, Verdana, Arial, sans-serif;
            }
          </style>
          </head>
          <body>
          <h1>Welcome to nginx!</h1>
          <p>If you see this page, the nginx web server is successfully installed and
          working. Further configuration is required.</p>
          
          <p>For online documentation and support please refer to
          <a href="http://nginx.org/">nginx.org</a>.<br/>
          Commercial support is available at
          <a href="http://nginx.com/">nginx.com</a>.</p>
          
          <p><em>Thank you for using nginx.</em></p>
          </body>
          </html>
        `, {
          headers: { 'Content-Type': 'text/html; charset=UTF-8' },
        });
      } else {
        return new Response('token 有误', {
          status: 400,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
    } catch (e) {
      return new Response(`Worker Error: ${e.message}`, {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
  }
};

async function checkFileExists(KV, filename) {
  const value = await KV.get(filename);
  return value !== null;
}

function decodeBase64(str) {
  const bytes = new Uint8Array(atob(str).split('').map(c => c.charCodeAt(0)));
  const decoder = new TextDecoder('utf-8');
  return decoder.decode(bytes);
}

function replaceSpacesWithPlus(str) {
  return str.replace(/ /g, '+');
}

function generateBatScript(domain, token) {
  return [
    `@echo off`,
    `chcp 65001`,
    `setlocal`,
    ``,
    `set "DOMAIN=${domain}"`,
    `set "TOKEN=${token}"`,
    ``,
    `set "FILENAME=%~nx1"`,
    ``,
    `for /f "delims=" %%i in ('powershell -command "$content = ((Get-Content -Path '%cd%/%FILENAME%' -Encoding UTF8) | Select-Object -First 65) -join [Environment]::NewLine; [convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content))"') do set "BASE64_TEXT=%%i"`,
    ``,
    `set "URL=https://%DOMAIN%/%FILENAME%?token=%TOKEN%^&b64=%BASE64_TEXT%"`,
    ``,
    `start %URL%`,
    `endlocal`,
    ``,
    `echo 更新数据完成,倒数5秒后自动关闭窗口...`,
    `timeout /t 5 >nul`,
    `exit`
  ].join('\r\n');
}

function generateShScript(domain, token) {
  return `#!/bin/bash
export LANG=zh_CN.UTF-8
DOMAIN="${domain}"
TOKEN="${token}"
if [ -n "$1" ]; then 
  FILENAME="$1"
else
  echo "无文件名"
  exit 1
fi
BASE64_TEXT=$(head -n 65 $FILENAME | base64 -w 0)
curl -k "https://$DOMAIN/$FILENAME?token=$TOKEN&b64=$BASE64_TEXT"
echo "更新数据完成"
`;
}

function generateConfigHTML(domain, token) {
  return `
    <html>
      <head>
        <title>CF-Workers-TEXT2KV</title>
      </head>
      <body>
        <h1 class="centered">CF-Workers-TEXT2KV 配置信息</h1>
        <p class="centered">
        服务域名: ${domain} <br>
        token: ${token} <br>
        <br>
        <pre>注意! 因URL长度内容所限，脚本更新方式一次最多更新65行内容</pre><br>
        Windows脚本: <button type="button" onclick="window.open('https://${domain}/config/update.bat?token=${token}', '_blank')">点击下载</button>
        <br>
        <pre>使用方法: <code>&lt;update.bat&nbsp;ip.txt&gt;</code></pre>
        <br>
        Linux脚本: 
        <code>&lt;curl&nbsp;https://${domain}/config/update.sh?token=${token}&nbsp;-o&nbsp;update.sh&nbsp;&&&nbsp;chmod&nbsp;+x&nbsp;update.sh&gt;</code><br>
        <pre>使用方法: <code>&lt;./update.sh&nbsp;ip.txt&gt;</code></pre><br>
        <br>
        在线文档查询: <br>
        https://${domain}/<input type="text" name="keyword" placeholder="请输入要查询的文档">?token=${token}    
        <button type="button" onclick="window.open('https://${domain}/' + document.querySelector('input[name=keyword]').value + '?token=${token}', '_blank')">查看文档内容</button>
        <button type="button" onclick="navigator.clipboard.writeText('https://${domain}/' + document.querySelector('input[name=keyword]').value + '?token=${token}')">复制文档地址</button>
        </p>
    <br>
      </body>
    </html>
  `;
}
