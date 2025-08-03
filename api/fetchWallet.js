const axios = require('axios');
const cheerio = require('cheerio');

module.exports = async (req, res) => {
    const { address } = req.query;

    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Địa chỉ ví không hợp lệ' });
    }

    try {
        const url = `https://shannon-explorer.somnia.network/address/${address}`;
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // Trích xuất transaction count (giả định nằm trong thẻ có class cụ thể)
        let transactionCount = 0;
        const txElement = $('.transaction-count').text(); // Cần kiểm tra class thực tế trên trang
        if (txElement) {
            transactionCount = parseInt(txElement.replace(/,/g, '')) || 0;
        }

        // Trích xuất balance (cần điều chỉnh selector)
        let balance = 0;
        const balanceElement = $('.balance-value').text(); // Cần kiểm tra class thực tế
        if (balanceElement) {
            balance = parseFloat(balanceElement.split(' ')[0]) || 0;
        }

        // Trích xuất token count (cần điều chỉnh selector)
        let tokenCount = 0;
        const tokenElement = $('.token-count').text(); // Cần kiểm tra class thực tế
        if (tokenElement) {
            tokenCount = parseInt(tokenElement.replace(/,/g, '')) || 0;
        }

        res.json({
            balance,
            transactionCount,
            tokenHoldings: [{ token: 'Unknown', balance: 0 }], // Cần parse thêm nếu muốn token
            lastActive: new Date().toISOString().split('T')[0],
            somAirdropEstimate: 100 // Giả định cơ bản
        });
    } catch (error) {
        res.status(500).json({ error: `Lỗi khi lấy dữ liệu: ${error.message}` });
    }
};