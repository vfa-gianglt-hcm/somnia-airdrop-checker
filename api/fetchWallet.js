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
        let pageParams = { block_number: null, index: null, items_count: 50 }; // Start with initial values

        while (true) {
            const transactionsResponse = await axios.get(`${baseUrl}/addresses/${address}/transactions`, {
                params: {
                    block_number: pageParams.block_number,
                    index: pageParams.index,
                    items_count: pageParams.items_count
                }
            });
            const transactionData = transactionsResponse.data;

            transactionCount += transactionData.items ? transactionData.items.length : 0;

            // Check for next page
            if (!transactionData.next_page_params || !transactionData.next_page_params.block_number) {
                break;
            }
            pageParams = transactionData.next_page_params;
        }

        // Fetch token balances
        const tokenResponse = await axios.get(`${baseUrl}/addresses/${address}/token-balances`);
        const tokenData = tokenResponse.data;

        // Process data
        const balance = parseFloat(addressData.coin_balance || '0') / 1e18; // Convert from Wei to STT (adjust decimals if needed)
        const tokenHoldings = tokenData.map(token => ({
            token: token.token.name || 'Unknown',
            balance: parseFloat(token.value || '0') / Math.pow(10, parseInt(token.token.decimals || '18')) // Adjust decimals based on token
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