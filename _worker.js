let mytoken = 'passwd';

export default {
	async fetch(request, env) {
		try {
			console.log('Fetching request...');
			
			// If there is a TOKEN in the environment variables, assign it to mytoken, otherwise keep the default value
			mytoken = env.TOKEN || mytoken;

			let KV;
			// Check if KV (key-value storage) has been set
			if (env.KV) {
				// Assign env.KV to a constant named KV
				KV = env.KV;
			} else {
				// KV namespace not bound
				console.log('KV namespace not bound');
				return new Response('KV 命名空间未绑定', {
					status: 400,
					headers: { 'content-type': 'text/plain; charset=utf-8' },
				});
			}

			// Get the needed parameters from the request URL
			const url = new URL(request.url);
			let token;
			if (url.pathname === `/${mytoken}`) {
				token = mytoken;
			} else {
				// Get 'token' from URL query parameters, if not present assign it as "null"
				token = url.searchParams.get('token') || "null";
			}

			// Check if the provided token matches mytoken
			if (token === mytoken) {
				const 文件名 = url.pathname.startsWith('/') ? url.pathname.substring(1) : url.pathname;

				if (文件名 == "config" || 文件名 == mytoken) {
					const html = configHTML(url.hostname, token);
					return new Response(html, {
						headers: {
							'Content-Type': 'text/html; charset=UTF-8',
						},
					});
				} else if (文件名 == "config/update.bat") {
					return new Response(下载bat(url.hostname, token), {
						headers: {
							"Content-Disposition": `attachment; filename=update.bat`,
							"content-type": "text/plain; charset=utf-8",
						},
					});
				} else if (文件名 == "config/update.sh") {
					return new Response(下载sh(url.hostname, token), {
						headers: {
							"Content-Disposition": `attachment; filename=update.sh`,
							"content-type": "text/plain; charset=utf-8",
						},
					});
				} else {
					// Get 'text' and 'b64' from URL query parameters, if not present assign them as "null"
					const text = url.searchParams.get('text') || "null";
					const b64 = url.searchParams.get('b64') || "null";

					// If both 'text' and 'b64' are "null", read and return the file content from KV
					if (text === "null" && b64 === "null") {
						const value = await KV.get(文件名);
						console.log(`Retrieved value from KV for ${文件名}: ${value}`);
						return new Response(value, {
							status: 200,
							headers: { 'content-type': 'text/plain; charset=utf-8' },
						});
					} else {
						// Check if the file exists
						await fileExists(KV, 文件名);

						// If 'b64' is "null", write the file in plain text, if 'text' is "null", write the file in base64
						if (b64 === "null") {
							await KV.put(文件名, text);
							return new Response(text, {
								status: 200,
								headers: { 'content-type': 'text/plain; charset=utf-8' },
							});
						} else if (text === "null") {
							const decodedText = base64Decode(空格替换加号(b64));
							await KV.put(文件名, decodedText);
							return new Response(decodedText, {
								status: 200,
								headers: { 'content-type': 'text/plain; charset=utf-8' },
							});
						}
					}
				}
			} else if (url.pathname == "/") { // Home page changed to an nginx spoofing page
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
					headers: {
						'Content-Type': 'text/html; charset=UTF-8',
					},
				});
			} else { // If the token does not match, return 'token 有误'
				console.log('Token mismatch');
				return new Response('token 有误', {
					status: 400,
					headers: { 'content-type': 'text/plain; charset=utf-8' },
				});
			}
		} catch (error) {
			console.error('Error during fetch:', error);
			return new Response('Internal Server Error', {
				status: 500,
				headers: { 'content-type': 'text/plain; charset=utf-8' },
			});
		}
	}
};

// Define an async function named fileExists to check if the file exists by querying the KV for a value corresponding to the filename
async function fileExists(KV, filename) {
	const value = await KV.get(filename);
	return value !== null;
}

// Define a function named base64Decode to convert a base64 encoded string to a utf-8 encoded character
function base64Decode(str) {
	const bytes = new Uint8Array(atob(str).split('').map(c => c.charCodeAt(0)));
	const decoder = new TextDecoder('utf-8');
	return decoder.decode(bytes);
}

function 空格替换加号(str) {
	return str.replace(/ /g, '+');
}

function 下载bat(域名, token) {
	return [
		`@echo off`,
		`chcp 65001`,
		`setlocal`,
		``,
		`set "DOMAIN=${域名}"`,
		`set "TOKEN=${token}"`,
		``,
		`rem %~nx1表示第一个参数的文件名和扩展名`,
		`set "FILENAME=%~nx1"`,
		``,
		`rem PowerShell命令读取文件的前65行内容，将内容转换为UTF8并进行base64编码`,
		`for /f "delims=" %%i in ('powershell -command "$content = ((Get-Content -Path '%cd%/%FILENAME%' -Encoding UTF8) | Select-Object -First 65) -join [Environment]::NewLine; [convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content))"') do set "BASE64_TEXT=%%i"`,
		``,
		`rem 将内容保存到response.txt`,
		`rem echo %BASE64_TEXT% > response.txt`,
		``,
		`rem 构造带有文件名和内容作为参数的URL`,
		`set "URL=https://%DOMAIN%/%FILENAME%?token=%TOKEN%^&b64=%BASE64_TEXT%"`,
		``,
		`rem 显示请求的响应 `,
		`rem powershell -Command "(Invoke-WebRequest -Uri '%URL%').Content"`,
		`start %URL%`,
		`endlocal`,
		``,
		`echo 更新数据完成,倒数5秒后自动关闭窗口...`,
		`timeout /t 5 >nul`,
		`exit`
	].join('\r\n');
}

function 下载sh(域名, token) {
	return `#!/bin/bash
export LANG=zh_CN.UTF-8
DOMAIN="${域名}"
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
`
}

function configHTML(域名, token) {
	return `
	<html>
		<head>
			<title>CF-Workers-TEXT2KV</title>
		</head>
		<body>
			<h1 class="centered">CF-Workers-TEXT2KV 配置信息</h1>
			<p class="centered">
			服务域名: ${域名} <br>
			token: ${token} <br>
			<br>
			<pre>注意! 因URL长度内容所限，脚本更新方式一次最多更新65行内容</pre><br>
			Windows脚本: <button type="button" onclick="window.open('https://${域名}/config/update.bat?token=${token}', '_blank')">点击下载</button>
			<br>
			<pre>使用方法: <code>&lt;update.bat&nbsp;ip.txt&gt;</code></pre>
			<br>
			Linux脚本: 
			<code>&lt;curl&nbsp;https://${域名}/config/update.sh?token=${token}&nbsp;-o&nbsp;update.sh&nbsp;&&&nbsp;chmod&nbsp;+x&nbsp;update.sh&gt;</code><br>
			<pre>使用方法: <code>&lt;./update.sh&nbsp;ip.txt&gt;</code></pre><br>
			<br>
			在线文档查询: <br>
			https://${域名}/<input type="text" name="keyword" placeholder="请输入要查询的文档">?token=${token}    
			<button type="button" onclick="window.open('https://${域名}/' + document.querySelector('input[name=keyword]').value + '?token=${token}', '_blank')">查看文档内容</button>
			<button type="button" onclick="navigator.clipboard.writeText('https://${域名}/' + document.querySelector('input[name=keyword]').value + '?token=${token}')">复制文档地址</button>
			</p>
		<br>
		</body>
	</html>
	`
}
