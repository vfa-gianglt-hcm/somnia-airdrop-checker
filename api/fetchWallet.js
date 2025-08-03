const axios = require('axios');

module.exports = async (req, res) => {
    const { address } = req.query;

    // Validate address
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
    }

    try {
        // Base URL for Somnia Testnet Explorer API
        const baseUrl = 'https://shannon-explorer.somnia.network/api/v2';

        // Fetch address overview (balance)
        const addressResponse = await axios.get(`${baseUrl}/addresses/${address}`);
        const addressData = addressResponse.data;
        const rawBalance = parseFloat(addressData.coin_balance || '0'); // Giá trị thô từ API
        const balance = rawBalance / 1e18; // Chuyển từ wei sang STT (18 decimals)

        // Fetch counters (transactions_count, token_transfers_count, gas_usage_count)
        const countersResponse = await axios.get(`${baseUrl}/addresses/${address}/counters`);
        const countersData = countersResponse.data;
        const transactionsCount = parseInt(countersData.transactions_count || '0');
        const tokenTransfersCount = parseInt(countersData.token_transfers_count || '0');
        const rawGasUsageCount = parseFloat(countersData.gas_usage_count || '0'); // Giá trị thô từ API
        const gasUsageCount = rawGasUsageCount / 109436900; // Chuyển về 12.1

        // Fetch NFT holdings
        let nftCount = 0;
        let nftPageParams = { unique_token: null };
        while (true) {
            const nftResponse = await axios.get(`${baseUrl}/addresses/${address}/nft`, {
                params: {
                    unique_token: nftPageParams.unique_token
                }
            });
            const nftData = nftResponse.data;
            nftCount += nftData.items ? nftData.items.length : 0;

            if (!nftData.next_page_params || !nftData.next_page_params.unique_token) {
                break;
            }
            nftPageParams = nftData.next_page_params;

            // Giới hạn tối đa 20,000 trang để tránh lặp vô hạn
            if (nftPageParams.unique_token && nftPageParams.unique_token > 20000) {
                console.log('Reached maximum NFT page limit, stopping pagination');
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

        // Fetch coin balance history
        const historyResponse = await axios.get(`${baseUrl}/addresses/${address}/coin-balance-history`);
        const historyData = historyResponse.data;
        let historyBonus = 0;
        if (historyData.next_page_params && historyData.next_page_params.items_count > 20) {
            historyBonus = 200; // Nếu items_count > 20, cộng 200 $SOM
        } else if (historyData.next_page_params && historyData.next_page_params.items_count > 10) {
            historyBonus = 100; // Nếu items_count > 10, cộng 100 $SOM
        }

        // In ra giá trị đầu vào để debug
        console.log('Debug values:', {
            rawBalance,
            balance,
            transactionsCount,
            tokenTransfersCount,
            rawGasUsageCount,
            gasUsageCount,
            nftCount,
            historyItemsCount: historyData.next_page_params ? historyData.next_page_params.items_count : 0,
            historyBonus
        });

        // Tính toán airdrop $SOM với công thức mới, giảm xuống 10,982 (khoảng 5/7 của 15,298)
        let somEstimate = 0;

        // Balance (k1 = 0.81 * 5/7 ≈ 0.57857)
        somEstimate += balance * 10 * 0.57857;

        // transactionsCount (k2 = 1.3 * 5/7 ≈ 0.92857)
        somEstimate += transactionsCount * 2 * 0.92857;

        // tokenTransfersCount (k3 = 1.3 * 5/7 ≈ 0.92857) + bonus 100 * 5/7 ≈ 71.43 nếu > 10
        somEstimate += tokenTransfersCount * 2 * 0.92857;
        if (tokenTransfersCount > 10) {
            somEstimate += 71.43;
        }

        // gasUsageCount (k4 = 1.85 * 5/7 ≈ 1.32143)
        somEstimate += gasUsageCount * 10 * 1.32143;

        // nftCount (k5 = 1.6 * 5/7 ≈ 1.14286)
        if (nftCount >= 10) {
            somEstimate += nftCount * 10 * 1.14286;
        } else {
            somEstimate += nftCount * 11 * 1.14286 / 1.6; // Điều chỉnh tỷ lệ
        }

        // Add history bonus (200 * 5/7 ≈ 142.86 hoặc 100 * 5/7 ≈ 71.43)
        somEstimate += historyBonus * 5 / 7;

        // Fetch last active timestamp
        const transactionsResponse = await axios.get(`${baseUrl}/addresses/${address}/transactions`, {
            params: { filter: 'validated', items_count: 1 }
        });
        const transactionData = transactionsResponse.data;

        res.json({
            balance,
            transactionsCount,
            tokenTransfersCount,
            gasUsageCount,
            nftCount,
            tokenHoldings,
            historyItemsCount: historyData.next_page_params ? historyData.next_page_params.items_count : 0,
            historyBonus: historyBonus * 5 / 7, // Hiển thị bonus đã giảm
            lastActive: transactionData.items && transactionData.items.length > 0 ? transactionData.items[0].timestamp : '2025-08-03T14:17:00Z', // UTC time
            somAirdropEstimate: somEstimate
        });
    } catch (error) {
        res.status(500).json({ error: `Error fetching data: ${error.message}` });
    }
};