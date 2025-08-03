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

        // Fetch total transactions with pagination
        let transactionCount = 0;
        let page = 1;
        const limit = 1000; // Adjust based on API limit, if known

        while (true) {
            const transactionsResponse = await axios.get(`${baseUrl}/addresses/${address}/transactions`, {
                params: { page, limit }
            });
            const transactionData = transactionsResponse.data;

            transactionCount += transactionData.items ? transactionData.items.length : 0;

            // Break if no more items or total is provided in metadata
            if (!transactionData.items || transactionData.items.length < limit || (transactionData.total && transactionCount >= transactionData.total)) {
                break;
            }
            page++;
        }

        // Fetch token balances
        const tokenResponse = await axios.get(`${baseUrl}/addresses/${address}/token-balances`);
        const tokenData = tokenResponse.data;

        // Process data
        const balance = parseFloat(addressData.coin_balance || '0') / 1e18; // Convert from Wei to STT
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