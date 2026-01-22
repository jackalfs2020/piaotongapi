const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();
const port = process.env.PORT || 3000;

// ================= 配置区域 =================
const CONFIG = {
    url: 'http://fpkj.testnw.vpiaotong.cn/tp/openapi/invoiceBlue.pt', // 蓝字开票测试地址
    platformCode: '11111111',
    desKey: 'lsBnINDxtct8HZB7KCMyhWSJ', // 3DES 密钥
    // RSA 私钥 (用于签名) - 注意：实际使用请保持格式正确，保留换行
    privateKey: `-----BEGIN PRIVATE KEY-----
MIICdQIBADANBgkqhkiG9w0BAQEFAASCAl8wggJbAgEAAoGBAIVLAoolDaE7m5oM
B1ZrILHkMXMF6qmC8I/FCejz4hwBcj59H3rbtcycBEmExOJTGwexFkNgRakhqM+3
uP3VybWu1GBYNmqVzggWKKzThul9VPE3+OTMlxeG4H63RsCO1//J0MoUavXMMkL3
txkZBO5EtTqek182eePOV8fC3ZxpAgMBAAECgYBp4Gg3BTGrZaa2mWFmspd41lK1
E/kPBrRA7vltMfPj3P47RrYvp7/js/Xv0+d0AyFQXcjaYelTbCokPMJT1nJumb2A
/Cqy3yGKX3Z6QibvByBlCKK29lZkw8WVRGFIzCIXhGKdqukXf8RyqfhInqHpZ9Ao
Y2W60bbSP6EXj/rhNQJBAL76SmpQOrnCI8Xu75di0eXBN/bE9tKsf7AgMkpFRhaU
8VLbvd27U9vRWqtu67RY3sOeRMh38JZBwAIS8tp5hgcCQQCyrOS6vfXIUxKoWyvG
yMyhqoLsiAdnxBKHh8tMINo0ioCbU+jc2dgPDipL0ym5nhvg5fCXZC2rvkKUltLE
qq4PAkAqBf9b932EpKCkjFgyUq9nRCYhaeP6JbUPN3Z5e1bZ3zpfBjV4ViE0zJOM
B6NcEvYpy2jNR/8rwRoUGsFPq8//AkAklw18RJyJuqFugsUzPznQvad0IuNJV7jn
smJqo6ur6NUvef6NA7ugUalNv9+imINjChO8HRLRQfRGk6B0D/P3AkBt54UBMtFe
fOLXgUdilwLdCUSw4KpbuBPw+cyWlMjcXCkj4rHoeksekyBH1GrBJkLqDMRqtVQU
ubuFwSzBAtlc
-----END PRIVATE KEY-----`
};

// ================= 工具函数 =================

// 1. 3DES 加密
function encrypt3DES(data, key) {
    const keyBuffer = Buffer.from(key);
    const ivBuffer = Buffer.alloc(0); // ECB模式不需要IV，但Node API可能需要空buffer
    const cipher = crypto.createCipheriv('des-ede3', keyBuffer, null);
    cipher.setAutoPadding(true); // PKCS5Padding
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
}

// 2. RSA 签名
function signRSA(signString, privateKey) {
    const sign = crypto.createSign('RSA-SHA1');
    sign.update(signString);
    return sign.sign(privateKey, 'base64');
}

// 3. 获取当前时间 yyyy-MM-dd HH:mm:ss
function getTimeString() {
    const date = new Date();
    // 简单格式化，注意时区问题，Zeabur默认UTC，这里简单处理
    return date.toISOString().replace('T', ' ').substring(0, 19);
}

// ================= 路由处理 =================

app.get('/', (req, res) => {
    res.send('服务已运行，请访问 /test-invoice 开始测试');
});

app.get('/test-invoice', async (req, res) => {
    try {
        const serialNo = 'DEMO' + Date.now(); // 生成唯一流水号
        const timestamp = getTimeString();

        // 1. 准备业务报文 (你的电子元件 + 折扣 案例)
        const businessContentObj = {
            "taxpayerNum": "500102201007206608",
            "invoiceReqSerialNo": serialNo,
            "invoiceIssueKindCode": "82", // 普票
            "buyerName": "四川测试科技有限公司",
            "buyerTaxpayerNum": "91510100MA6C123456",
            "showBuyerAddrTel": "1",
            "showBuyerBank": "1",
            "buyerAddress": "成都市高新区天府大道1号",
            "buyerTel": "028-12345678",
            "buyerBankName": "工商银行成都高新支行",
            "buyerBankAccount": "6222024400000000001",
            "drawerName": "管理员",
            "remark": "Zeabur测试-电子元件折扣",
            "itemList": [
                {
                    "goodsName": "电子元件*电阻器",
                    "taxClassificationCode": "1090514010000000000",
                    "specificationModel": "R-10K",
                    "quantity": "1000",
                    "invoiceAmount": "100.00", // 折后价
                    "discountAmount": "13.00", // 折扣额
                    "includeTaxFlag": "1",
                    "taxRateValue": "0.13"
                },
                {
                    "goodsName": "电子元件*电容器",
                    "taxClassificationCode": "1090514020000000000",
                    "specificationModel": "C-100uF",
                    "quantity": "500",
                    "invoiceAmount": "200.00", // 折后价
                    "discountAmount": "26.00", // 折扣额
                    "includeTaxFlag": "1",
                    "taxRateValue": "0.13"
                }
            ]
        };

        const contentJsonStr = JSON.stringify(businessContentObj);
        console.log("原始报文:", contentJsonStr);

        // 2. 3DES 加密 content
        const encryptedContent = encrypt3DES(contentJsonStr, CONFIG.desKey);

        // 3. 拼接代签名字符串 (按参数名首字母排序)
        // 顺序: content, format, platformCode, serialNo, signType, timestamp, version
        const stringToSign = `content=${encryptedContent}&format=JSON&platformCode=${CONFIG.platformCode}&serialNo=${serialNo}&signType=RSA&timestamp=${timestamp}&version=1.0`;

        // 4. RSA 签名
        const sign = signRSA(stringToSign, CONFIG.privateKey);

        // 5. 组装最终发送的请求体
        const finalPayload = {
            platformCode: CONFIG.platformCode,
            signType: 'RSA',
            format: 'JSON',
            version: '1.0',
            timestamp: timestamp,
            serialNo: serialNo,
            sign: sign,
            content: encryptedContent
        };

        // 6. 发送请求
        console.log("正在发送请求到:", CONFIG.url);
        const response = await axios.post(CONFIG.url, finalPayload, {
            headers: { 'Content-Type': 'application/json' }
        });

        // 7. 返回结果给浏览器
        res.json({
            status: 'Done',
            requestSerialNo: serialNo,
            apiResponse: response.data,
            queryTip: `请使用 serialNo: ${serialNo} 调用查询接口`
        });

    } catch (error) {
        console.error("请求失败:", error);
        res.status(500).json({
            error: error.message,
            stack: error.stack,
            response: error.response ? error.response.data : 'No response data'
        });
    }
});

app.listen(port, () => {
    console.log(`Test app listening at http://localhost:${port}`);
});
