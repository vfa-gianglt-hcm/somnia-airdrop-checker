const axios = require('axios');

module.exports = async (req, res) => {
    const { address } = req.query;

    // Validate address
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Địa chỉ ví không hợp lệ' });
    }

    try {
        // Base URL for Somnia Testnet Explorer API
        const baseUrl = 'https://shannon-explorer.somnia.network/api/v2';

        // Fetch address overview (balance)
        const addressResponse = await axios.get(`${baseUrl}/addresses/${address}`);
        const addressData = addressResponse.data;

        // Fetch transactions to count them
        const transactionsResponse = await axios.get(`${baseUrl}/addresses/${address}/transactions`);
        const transactionData = transactionsResponse.data;

        // Fetch token balances
        const tokenResponse = await axios.get(`${baseUrl}/addresses/${address}/token-balances`);
        const tokenData = tokenResponse.data;

        // Process data
        const balance = parseFloat(addressData.coin_balance || '0') / 1e18; // Convert from Wei to STT
        const transactionCount = transactionData.items ? transactionData.items.length : 0; // Count transactions
        const tokenHoldings = tokenData.map(token => ({
            token: token.token.name || 'Unknown',
            balance: parseFloat(token.value || '0') / Math.pow(10, parseInt(token.token.decimals || '18')) // Convert based on decimals
        }));

        res.json({
            balance,
            transactionCount,
            tokenHoldings,
            lastActive: transactionData.items && transactionData.items.length > 0 ? transactionData.items[0].timestamp : new Date().toISOString().split('T')[0]
        });
    } catch (error) {
        res.status(500).json({ error: `Lỗi khi lấy dữ liệu: ${error.message}` });
    }
};