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

        // Fetch counters (transactions_count, token_transfers_count, gas_usage_count)
        const countersResponse = await axios.get(`${baseUrl}/addresses/${address}/counters`);
        const countersData = countersResponse.data;
        const transactionsCount = parseInt(countersData.transactions_count || '0');
        const tokenTransfersCount = parseInt(countersData.token_transfers_count || '0');
        const gasUsageCount = parseFloat(countersData.gas_usage_count || '0');

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

        // Tính toán airdrop $SOM theo công thức mới
        let somEstimate = 0;

        // 1 token $STT = 10 $SOM, nếu > 1 thì nhân đôi
        if (balance > 1) {
            somEstimate += balance * 2 * 3;
        } else {
            somEstimate += balance * 2;
        }

        // 1 transactions_count = 20 $SOM, nếu > 1 thì nhân đôi
        if (transactionsCount > 1) {
            somEstimate += transactionsCount * 2 * 1;
        } else {
            somEstimate += transactionsCount * 2;
        }

        // 1 token_transfers_count = 30 $SOM, nếu > 1 thì nhân đôi
        if (tokenTransfersCount > 1) {
            somEstimate += tokenTransfersCount * 2 * 5;
        } else {
            somEstimate += tokenTransfersCount * 3;
        }

        // Nếu token_transfers_count > 10, thêm random từ 10 đến 300 $SOM
        if (tokenTransfersCount > 10) {
            const randomBonus = Math.floor(Math.random() * (300 - 10 + 1)) + 10;
            somEstimate += randomBonus;
        }

        // 0.1 gas_usage_count = 100 $SOM, nếu > 0.1 thì nhân đôi
        if (gasUsageCount > 0.1) {
            somEstimate += (gasUsageCount / 0.1) * 2 * 9;
        } else {
            somEstimate += (gasUsageCount / 0.1) * 8;
        }

        // 1 NFT = 10 $SOM, nếu 10 NFT thì 10 * 100
        if (nftCount >= 10) {
            somEstimate += nftCount * 8;
        } else {
            somEstimate += nftCount * 11;
        }

        // // Giới hạn tối đa 10,000 $SOM
        // somEstimate = Math.min(somEstimate, 10000);

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
            lastActive: transactionData.items && transactionData.items.length > 0 ? transactionData.items[0].timestamp : new Date().toISOString().split('T')[0],
            somAirdropEstimate: somEstimate
        });
    } catch (error) {
        res.status(500).json({ error: `Lỗi khi lấy dữ liệu: ${error.message}` });
    }
};