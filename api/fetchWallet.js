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
        const balance = parseFloat(addressData.coin_balance || '0') / 1e18; // Giả định 18 decimals

        // Fetch total transactions with improved pagination
        let transactionCount = 0;
        let pageParams = { block_number: null, index: null, items_count: 100 }; // Tăng items_count để lấy nhiều hơn

        while (true) {
            const transactionsResponse = await axios.get(`${baseUrl}/addresses/${address}/transactions`, {
                params: {
                    block_number: pageParams.block_number,
                    index: pageParams.index,
                    items_count: pageParams.items_count,
                    filter: 'validated', // Chỉ lấy giao dịch đã xác nhận
                    // Thêm tham số bổ sung nếu cần (dựa trên tài liệu API)
                    // start_block: 0, // Có thể thử thêm nếu cần
                    // end_block: latest
                }
            });
            const transactionData = transactionsResponse.data;

            // Debug log chi tiết
            const itemsLength = transactionData.items ? transactionData.items.length : 0;
            console.log(`Page data - Block: ${pageParams.block_number}, Index: ${pageParams.index}, Items: ${itemsLength}, Total so far: ${transactionCount + itemsLength}`);

            transactionCount += itemsLength;

            // Kiểm tra nếu không còn trang tiếp theo
            if (!transactionData.next_page_params || !transactionData.next_page_params.block_number) {
                console.log(`Pagination ended. Final transaction count: ${transactionCount}`);
                break;
            }
            pageParams = transactionData.next_page_params;

            // Giới hạn tối đa 20,000 trang để tránh lặp vô hạn
            if (pageParams.index && pageParams.index > 20000) {
                console.log('Reached maximum page limit, stopping pagination');
                break;
            }
        }

        // Fetch token balances
        const tokenResponse = await axios.get(`${baseUrl}/addresses/${address}/token-balances`);
        const tokenData = tokenResponse.data;
        const tokenHoldings = tokenData.map(token => {
            const decimals = parseInt(token.token.decimals || '18');
            const balance = parseFloat(token.value || '0') / Math.pow(10, decimals);
            return {
                token: token.token.name || 'Unknown',
                balance: isNaN(balance) ? 0 : balance,
                decimals: decimals
            };
        }).filter(token => token.balance > 0);

        // Phỏng đoán airdrop $SOM
        let somEstimate = 100; // Điểm cơ bản
        if (transactionCount > 1000) somEstimate += 500;
        else if (transactionCount > 500) somEstimate += 300;
        else if (transactionCount > 100) somEstimate += 150;

        if (balance > 100) somEstimate += 200;
        else if (balance > 50) somEstimate += 100;
        else if (balance > 10) somEstimate += 50;

        somEstimate += tokenHoldings.length * 50;
        somEstimate = Math.min(somEstimate, 1000);

        res.json({
            balance,
            transactionCount,
            tokenHoldings,
            lastActive: transactionData.items && transactionData.items.length > 0 ? transactionData.items[0].timestamp : new Date().toISOString().split('T')[0],
            somAirdropEstimate: somEstimate
        });
    } catch (error) {
        res.status(500).json({ error: `Lỗi khi lấy dữ liệu: ${error.message}` });
    }
};