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

        // Fetch NFT transactions from Etherscan
        const etherscanApiKey = '48PPW3MS1F44I7PEYDT8A6TPKVIKD2PG4Y'; // Thay bằng API Key của bạn nếu cần bảo mật
        const etherscanUrl = `https://api.etherscan.io/api?module=account&action=tokennfttx&address=${address}&startblock=0&endblock=99999999&sort=asc&apikey=${etherscanApiKey}`;
        const etherscanResponse = await axios.get(etherscanUrl);
        const etherscanData = etherscanResponse.data;
        let nftBonus = 0;

        // Danh sách địa chỉ hợp đồng NFT và giá trị $SOM tương ứng
        const nftBonuses = {
            '0xe012baf811cf9c05c408e879c399960d1f305903': 4000, // Koda
            '0xd887090fc6f9af10abe6cf287ac8011a3cb55a65': 4500, // Quills
            '0x790b2cf29ed4f310bf7641f013c65d4560d28371': 3000, // Otherdeed Expanded
            '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d': 4200, // Bored Ape Yacht Club
            '0x60e4d786628fea6478f785a6d7e704777c86a7c6': 4000, // May
            '0xbd9071b63f25dd199079ed80b3b384d78042956b': 4000, // GRILLZ GANG
            '0x6e4b3bb131bd85682a2d3ddd5661d2816f186e81': 1000, // BambiLands
            '0x973ba8f890c316a627f1ec124321691def4136ab': 1200, // Uprising
            '0x06ec8fe4bc3701923a28682e5bf5ade78f6f8e0d': 500,  // Pixcape
            '0xd3cf04d7a5513ce8148790d90d91361476f5da94': 500   // DemonicSkulls
        };

        if (etherscanData.status === '1' && etherscanData.result.length > 0) {
            etherscanData.result.forEach(tx => {
                const contractAddress = tx.contractAddress.toLowerCase();
                if (nftBonuses[contractAddress]) {
                    nftBonus += nftBonuses[contractAddress];
                }
            });
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
            historyBonus,
            nftBonus
        });

        // Tính toán airdrop $SOM với công thức mới, mục tiêu 10,982 $SOM
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

        // Add NFT bonus from Etherscan
        somEstimate += nftBonus;

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
            nftBonus,
            lastActive: transactionData.items && transactionData.items.length > 0 ? transactionData.items[0].timestamp : '2025-08-03T15:06:00Z', // UTC time
            somAirdropEstimate: somEstimate
        });
    } catch (error) {
        res.status(500).json({ error: `Error fetching data: ${error.message}` });
    }
};