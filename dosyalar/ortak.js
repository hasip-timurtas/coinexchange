const mongodb = require('mongodb')
const rp = require('request-promise')
const MhtCcxt = require('../dll/mhtCcxt')

const mongoUrl = "mongodb://95.85.32.248:1453/";

class Ortak {
    async LoadVeriables(){
        this.minFark = 1
        this.mainMarkets = ['BTC', 'ETH', 'DOGE']
        this.site = 'coinexchange'
        const key = "dbec90fd39294e1fa90db54e404c2edc" // apo cry
        const secret = "D3tx+b8gb3Me2z3T/D/gzMdRWfNbR9vfYyf/RiqdJzc="
        this.ccx = new MhtCcxt(key, secret, this.site, null)
        this.limits = { "BTC": 0.0006, "ETH": 0.011, "LTC": 0.08, "DOGE": 1100, "BNB":5.1, "USD": 5, "USDT": 5 }
        this.sellLimits = { "BTC": 0.0005, "LTC": 0.008, "DOGE": 100, "ETH": 0.01}
        this.volumeLimtis = { "BTC": 0.5, "ETH": 10, "LTC": 50, "DOGE": 1100, "BNB":250, "USD":3250, "USDT":3250 }
        const connection = await mongodb.MongoClient.connect(mongoUrl, { useNewUrlParser: true });
        const cnn = connection.db('cry')
        this.depths = cnn.collection('ce-ws-depths')
        this.fbBalances = cnn.collection('balances')
        this.history = cnn.collection('history')
        this.mailData = cnn.collection('mailData')
        this.mailDataEski = cnn.collection('mailData-Eski')
        this.mailDataBosBuy = cnn.collection('mailData-bos-buy')
        this.mailDataHata = cnn.collection('mailData-hata')
        this.openOrders = cnn.collection('openOrders')
        this.testler = cnn.collection('testler')
        this.marketsInfos = await this.ccx.exchange.load_markets().catch(e=> console.log(e) )
        this.marketsInfos = this.marketsInfos && Object.keys(this.marketsInfos).map(e=> this.marketsInfos[e])
        this.marketTickers = await this.ccx.GetMarkets().catch(e=> console.log(e))
        this.islemdekiCoinler = []
        this.allData = []
        this.allActiveCoins = this.marketsInfos && this.marketsInfos.filter(e=> e.active &&  e.quote == 'BTC').map(e=>e.baseId.toUpperCase()).filter(e=> !this.mainMarkets.includes(e))
        this.testAmount = 100
        this.wsDataProcessing = true // ilk başta true diyoruz. ilk çalıştığında beklesin diye.
        this.ws
        this.wsZamanlayici = 30 // DAKİKA
    }

    InsertTestler(data){
        this.testler.insertOne(data)
    }

    WatchAllCollection(collection){
        collection.watch().on('change', data => {
            callback(data)
        });
    }

    async SubmitSellKontrol(marketName, rate, amount, type){
        const orderParams = [marketName, 'limit', type, amount, rate]
        if(marketName.includes('SHOW')){
            var dur = 1
        }
        const openOrderVar = await this.OpenOrderVarMi(marketName, type)
        if(openOrderVar){
            console.log(marketName + ' open order zaten var!')
            return false
        }

        const submitOrder = await this.ccx.exchange.createOrder(...orderParams).then(e=>{
            return e
        }).catch(e => {
            console.log(e, marketName)
        })

        if (submitOrder) {
            console.log(`${marketName} için  ${type} kuruldu.'`)
            return submitOrder
        } else {
            console.log(`${type} Kurarken Hata. market: ${marketName}`)
            return false
        }
    }

    async SubmitMongo(market, marketName, rate, amount, type){
        const orderParams = [marketName, 'limit', type, amount, rate]
        
        const submitOrder = await this.ccx.exchange.createOrder(...orderParams).catch(e => {
            market.Hata = e.message
            market.date = new Date()
            this.mailDataHata.insertOne(market)
            console.log(e, orderParams)
        })

        if (submitOrder) {
            console.log(`${marketName} için  ${type} kuruldu.'`)
            return submitOrder
        } else {
            console.log(`${type} Kurarken Hata. market: ${marketName}`)
            return false
        }
    }

    async OrderIptalEt(order) {
        return await this.ccx.CancelTrade(order.id, order.symbol).catch(e => console.log(e))
    }

    async OpenOrderVarMi(marketName, type){
        let openOrders = await this.ccx.GetOpenOrders(marketName)
        openOrders = openOrders.Data
        // const openOrders = await this.openOrders.find().toArray()
        if(openOrders.length == 0){  // hiç order yoksa mongo db dekileri siler ve false dönder.
            await this.DeleteOrderFb(marketName, type)
            return false
        } 
        const order = openOrders.find(e=> e.Market.includes(marketName) && e.Type == type )
        return order || false 
    }



    async DahaIyiMarketVarmi(openOrder, type){ // type sell yada buy sell de en hapalı buy da en ucuz market aranır.
        const altCoin = openOrder.market.split('/')[0]
        let market
        if(type == 'sell'){
            market = await this.HangiMarketteEnPahali(altCoin)
        }else if(type == 'buy'){
            market = await this.HangiMarketteEnUcuz(altCoin)
        }

        if(!market) return false
        return market.market != openOrder.market
    }
    /*
    async HangiMarketteEnPahali(coin){
        // marketler sırayla --> ADA/USDT, ADA/BTC, ADA/ETH ve BTC/USDT, ETH/USDT
        const altiTickers = await this.GetAltiMarketTickers(coin)
        if(!altiTickers) return false
        const { coinBtc, coinLtc, coinDoge, ethBtc, dogeBtc, dogeLtc } = altiTickers //await this.GetAltiMarketTickers(coin)
        const depthsKontrol = !coinBtc || !coinBtc.asks || !coinLtc || !coinLtc.asks || !coinDoge || !coinDoge.asks || !ethBtc || !ethBtc.asks || !dogeBtc || !dogeBtc.asks

        if(depthsKontrol) return false // eğer 1 market bile yoksa ve depthleri yoksa false dön, çünkü biz 3 markettede olanlarla iş yapıyoruz.

        const coinMarket2Total = this.GetMarketTotal(coinLtc)  // ADA/BTC
        const coinMarket3Total = this.GetMarketTotal(coinDoge)  // ADA/ETH
        

        coinBtc.total = this.GetMarketTotal(coinBtc)  // ADA/USDT  değeri  -> bu hesaplamayı bunda yapacağımız ana coin. diğerlerini buna çevireceğimizden bunu birşeye çevirmemize gerek yok.
        coinLtc.total = ethBtc.asks[0]['rate'] * coinMarket2Total // BTC/USDT  değeri
        coinDoge.total = dogeBtc.asks[0]['rate'] * coinMarket3Total  // ETH/USDT  değeri

        const markets = [coinBtc, coinLtc, coinDoge]
        const volumeliMarkets = markets.filter(e=> {
            const volumeUygun = this.marketTickers.Data.find(a=> a.Label == e.market && a.Volume > 0)
            return volumeUygun
        })

        if(volumeliMarkets.length < 3){
            var dur = 2
        }
        const volumeliUygunMarket = volumeliMarkets.sort((a,b)=> b.total - a.total)[0] // b-a büyükten küçüğe
        if(!volumeliUygunMarket){
            const vsizUygunMarket = markets.sort((a,b)=> b.total - a.total)[0]
            console.log(`Manuel satılması gereken coin: >>>>> ${coin}   market: >>>>> ${vsizUygunMarket.market} `)
            return false
        }
        volumeliUygunMarket.type = 'asks' // sell kurarken priceyi buydanmı sell denmi alsın diye kontrol
        return volumeliUygunMarket || false // sıraya dizdikten sonra ilk en BÜYÜK marketi döndürüyoruz.
    }
    */


    async HangiMarketteEnUcuz(coin){
        // marketler sırayla --> ADA/USDT, ADA/BTC, ADA/ETH ve BTC/USDT, ETH/USDT
        const { market1, market2, market3, market4, market5 } = await this.GetAltiMarketTickers(coin)
        
        if(!market1) return false // eğer 1 market bile yoksa false dön, çünkü biz 3 markettede olanlarla iş yapıyoruz.

        const coinMarket2Total = this.GetMarketTotal(market2, 'buy')  // ADA/BTC
        const coinMarket3Total = this.GetMarketTotal(market3, 'buy')  // ADA/ETH
        

        market1.total = this.GetMarketTotal(market1, 'buy')  // ADA/USDT  değeri  -> bu hesaplamayı bunda yapacağımız ana coin. diğerlerini buna çevireceğimizden bunu birşeye çevirmemize gerek yok.
        market2.total = market4.bids[0]['rate'] * coinMarket2Total // BTC/USDT  değeri
        market3.total = market5.bids[0]['rate'] * coinMarket3Total  // ETH/USDT  değeri

        const markets = [market1, market2, market3].sort((a,b)=> a.total - b.total) // a-b küçükten büğüğe
        return markets[0] || false // sıraya dizdikten sonra ilk en KÜÇÜK marketi döndürüyoruz.
    }

    async GetAltiMarketTickers(coin){
        // mainMarkets -> ['BTC', 'ETH', 'DOGE']
        const marketler = [
            coin + "/" + this.mainMarkets[0], // ADA/BTC
            coin + "/" + this.mainMarkets[1], // ADA/ETH
            coin + "/" + this.mainMarkets[2], // ADA/DOGE
            this.mainMarkets[1] + "/" + this.mainMarkets[0], // ETH/BTC
            this.mainMarkets[2] + "/" + this.mainMarkets[0], // DOGE/BTC
            this.mainMarkets[2] + "/" + this.mainMarkets[1]  // DOGE/ETH
        ]

        let orderBooks = await this.GetOrderBooks(marketler)
        const result = this.OrderBooksDataKontrol(orderBooks)
        
        if(!result || orderBooks.length < 6){
            orderBooks = await this.GetOrderBookGroupRest(coin)
        }

        if(!orderBooks) return false
        
        //coinBtc, coinLtc, coinDoge, ethBtc, dogeBtc, dogeLtc
        return { 
            coinBtc : orderBooks.find(e => e.market == marketler[0]),
            coinLtc : orderBooks.find(e => e.market == marketler[1]),
            coinDoge: orderBooks.find(e => e.market == marketler[2]),
            ethBtc  : orderBooks.find(e => e.market == marketler[3]),
            dogeBtc : orderBooks.find(e => e.market == marketler[4]),
            dogeLtc : orderBooks.find(e => e.market == marketler[5])
        }
    }

    async GetAltiMarketTickersForMongoJS(coin){
        // mainMarkets -> ['BTC', 'ETH', 'DOGE']
        const marketler = [
            coin + "/" + this.mainMarkets[0], // ADA/BTC
            coin + "/" + this.mainMarkets[1], // ADA/ETH
            coin + "/" + this.mainMarkets[2], // ADA/DOGE
            this.mainMarkets[1] + "/" + this.mainMarkets[0], // ETH/BTC
            this.mainMarkets[2] + "/" + this.mainMarkets[0], // DOGE/BTC
            this.mainMarkets[2] + "/" + this.mainMarkets[1]  // DOGE/ETH
        ]

        let orderBooks = await this.GetOrderBooks(marketler)
        const result = this.OrderBooksDataKontrol(orderBooks)
        if(!result || orderBooks.length < 6){
            orderBooks = await this.GetOrderBookGroupRest(coin)
        }

        if(!orderBooks) return false
        //coinBtc, coinLtc, coinDoge, ethBtc, dogeBtc, dogeLtc
        return orderBooks
        /*
        return { 
            coinBtc : orderBooks.find(e => e.market == marketler[0]),
            coinLtc : orderBooks.find(e => e.market == marketler[1]),
            coinDoge: orderBooks.find(e => e.market == marketler[2]),
            ethBtc  : orderBooks.find(e => e.market == marketler[3]),
            dogeBtc : orderBooks.find(e => e.market == marketler[4]),
            dogeLtc : orderBooks.find(e => e.market == marketler[5])
        }
        */
    }

    async GetOrderBooks(marketler, all = false){
        let orderBooks
        if(all) { // all true ise hepsini döndürür.
            orderBooks = await this.depths.find().toArray()
        }else{
            orderBooks = await this.depths.find( { 'market': { '$in': marketler } } ).toArray()
        }
        
        orderBooks = orderBooks.map(e=> {
            if(!e.depths){
                return e
            }
            e.depths.market = e.market
            return e.depths
        }) //  içinde market ismi olan depths gönderiyoruz. orjinalinde yok.
        
        return orderBooks
    }

    SetPrices(marketName){

        const basamak = this.marketsInfos.find(e=> e.id.toLowerCase() == marketName.replace('/','_').toLowerCase()).precision.price
        switch (basamak) {
            case 1: return 0.1
            case 2: return 0.01
            case 3: return 0.001
            case 4: return 0.0001
            case 5: return 0.00001
            case 6: return 0.000001
            case 7: return 0.0000001
            case 8: return 0.00000001
            case 9: return 0.000000001
            case 10: return 0.0000000001
        }
    }

    GetKacinci(marketOrders, openOrder, type) {
        var result = { sellSirasi: 0, ilkSellTutar: 0, ikinciSellPrice: 0}

        var secilenSellPrice = marketOrders[type].find(e => Number(e['rate']) == openOrder.price)
        result.sellSirasi = secilenSellPrice && marketOrders[type].indexOf(secilenSellPrice) + 1
        result.ikinciSellPrice = Number(marketOrders[type][1]['rate']) // ikinci sıradakinin buy price.. [1][1] olsaydı 2. sıradakinin amountu olurdu.
        result.ilkSellTutar = marketOrders[type][0]['amount']
        result.ilkSellTutar = Number(result.ilkSellTutar)

        return result
    }

    OndekiTutarKontrolu(sira, marketOrders, type){
        var ilkinTutari = marketOrders[type][0]['rate'] * marketOrders[type][0]['amount']  // Burası 1. sıradaki buy un tutarı yani kaç dogelik pazar kurmuş eğerki 1000 dogenin altındaysa önüne geçme
        var ilkVeIkincininTutari = ilkinTutari + marketOrders[type][1]['rate'] * marketOrders[type][1]['amount'] // Burası 1. sıradaki buy un tutarı yani kaç dogelik pazar kurmuş eğerki 1000 dogenin altındaysa önüne geçme
        var ilkIkiVeUcuncununTutari = ilkVeIkincininTutari + marketOrders[type][2]['rate'] * marketOrders[type][2]['amount']
        
        if(sira == 1){

        } else if (sira == 2 && ilkinTutari < this.bizimTutarin3te1i) {
            // 2. sıradaysa ve ilk orderin tutarı bizimkinin 3te1inden düşükse kalsın. bu ilerde %5 te olabilir.
        } else if (sira == 3 && ilkVeIkincininTutari < this.bizimTutarin3te1i) {
            // 3. sıradaysa ve ilkin ve ikincinin tutarı bizimkinin 3te1inden düşükse kalsın. bu ilerde %5 te olabilir.
        } else if (sira == 4 && ilkIkiVeUcuncununTutari < this.bizimTutarin3te1i) {
            // 4. sıradaysa ve ilkin ve ikincinin ve ucuncunun tutarı bizimkinin 3te1inden düşükse kalsın. bu ilerde %5 te olabilir.
        } else {
            //await this.CancelOrder(orderId)
            return true
        }

        return false
    }
    
    async GetBalance(){
        let balances = await this.ccx.GetBalance().catch(e => console.log(e))

        if(!balances || !balances.Data){
            return await this.GetBalance()
        }
        balances = balances.Data
        const isimleriFarkliCoinler = this.marketsInfos.filter(e=> e.baseId != e.base).map(e=> ({base: e.base, baseId: e.baseId}))
        balances.filter(e=> {
            if(isimleriFarkliCoinler.map(e=> e.base).includes(e.Symbol)){
                const coin = isimleriFarkliCoinler.find(a=> a.base == e.Symbol)
                e.Symbol = coin.baseId
            }
        })

        return balances.sort((a,b)=> a.Symbol - b.Symbol)
    }

    async fbBalancesUpdate(totalBalances){
        await this.fbBalances.deleteMany({})
        this.fbBalances.insertMany(totalBalances)
    }

    async GetTickers(marketler){
        let tickers = await this.depths.find( { 'market': { '$in': marketler } } ).toArray()
        tickers = tickers.map(e=> {
            e.ticker.market = e.market
            return e.ticker
        }) //  içinde market ismi olan tickeri gönderiyoruz. orjinalinde yok.
        return tickers
    }

    async GetOrderBook(marketName){
        
        let marketOrders = await this.depths.findOne({ market: marketName } )
        if(!marketOrders){
            return false
        }
        marketOrders = marketOrders.depths

        const result = this.OrderBooksDataKontrol([marketOrders])

        if(!result){
            return false
            //return await this.GetOrderBooksRest(marketName) 
        }
        
        return marketOrders
    }

    async GetHistory(coin){
        let marketHistory = await this.history.find({ coin } ).toArray()
        const history = marketHistory.sort((a,b)=> b.date - a.date) // en son history kaydını alıyoruz.

        return history[0] // son eklenen historiyi verir. güncel data.
    }

    sleep (saniye) {
		return new Promise(resolve => setTimeout(resolve, saniye * 1000))
    }

    // ################ MIN MAX BUY! ####################################################################################### MIN MAX

    async MinMaxBuyKontrol(marketName){
        const altCoin = marketName.split('/')[0]
        const baseCoin = marketName.split('/')[1]
        const marketNames = [altCoin + '/USDT', altCoin + '/BTC', altCoin + '/ETH' ]
        const coinTickers = await this.GetTickers(marketNames)

        // buy open ordersta var mı ? // normalde submitte var ama burdada kontrol ediyoruz fazla istek olmasın diye.
        const openOrderVar = await this.OpenOrderVarMi(marketName, 'buy')
        if(openOrderVar){
            console.log(marketName + ' open order zaten var!')
            return false
        }

        // VOLUME ŞİMDİLİK KALDIRILDI AMA EKLENMELİ. 2. marketin volume si de önemli çünkü!!!
        
        let volumeUygunCount = 0
        for (const ticker of coinTickers) {
            //if(ticker.vol == 0) return // marketlerin birinde bile volume 0 varsa çıkgit.
            const baseCoin2 = ticker.market.split('/')[1]
            const volume = ticker.buy * ticker.vol
            
            if(volume >= this.volumeLimtis[baseCoin2]){
                volumeUygunCount++
            }
        }

        if(volumeUygunCount < 3) { // Bütün marketlerin volumeleri bizim limitlerin altındaysa bu coine girme!
            console.log('Minimum 3 market Volumeleri yeterli değil. ÇIK: ', marketName)
            return
        }

        // alt coin için yeterince balance var mı ?
        const balances = await this.GetBalance()
        const altCoinBalance = balances.find(e=> e.Symbol == altCoin).Total
        const marketTicker = coinTickers.find(e=> e.market == marketName)
        const total = marketTicker.sell * altCoinBalance

        if(total >= this.limits[baseCoin] ){
            console.log('elde yeterince coin var. ÇIK: ', marketName)
            return
        }
  
        const ondalikliSayi = this.SetPrices(marketName)
        const buyPrice = Number(marketTicker.buy) + ondalikliSayi
        const alinacakBalance = this.limits[baseCoin] * 15 / marketTicker.buy // total 10 * limit 
        // Şartlara uyuyorsa buy yap.
        await this.Submit(marketName, buyPrice, alinacakBalance, 'buy').then(async (e)=>{
            if(!e.id) return
            await this.InsertOrderFb(e, 'buy')
        }).catch(e=>{
            console.log(e, balance.Symbol)
        })
    }

    async MinMaxKontrol(coin){
        this.islemdekiCoinler.push(coin)
        if(coin == 'HOT'){
            var dur = 1
        }
        //console.log(coin + ' GİRDİ', this.islemdekiCoinler)
        const enUcuzMarket = await this.HangiMarketteEnUcuz(coin)
        const enPahaliMarket = await this.HangiMarketteEnPahali(coin)
        if(!enUcuzMarket || !enPahaliMarket) return
        const yuzdeFark = (enPahaliMarket.total - enUcuzMarket.total) / enUcuzMarket.total * 100
        const ayniMarket = enUcuzMarket.market == enPahaliMarket.market
        if(isNaN(yuzdeFark)){
            var dur = 1
        }
        if(!ayniMarket && yuzdeFark >= 10 ){ // aynı market değilse ve fark %10 dan büyükse girsin.
            console.log('Buy için giriliyor yüzde fark: '+ yuzdeFark)
            await this.MinMaxBuyKontrol(enUcuzMarket.market)
        } 
        /*
        else if(ayniMarket && yuzdeFark >= 25){ // aynı marketse ve yüzde farkı 30 dan büyükse girsin.
            await this.MinMaxBuyKontrol(enUcuzMarket.market)
        }else{
            console.log('yüzde uymadı yüzde: ', yuzdeFark)
        }
        */
        this.islemdekiCoinler = this.islemdekiCoinler.filter(e=> e != coin)
        //console.log(coin + ' ÇIKTI', this.islemdekiCoinler)
    }

    async DeleteOrderFb(market, type){
        await this.openOrders.deleteOne({market, side: type})
        /*
        const marketNameFb = order.market.replace('/','_') + '-' +  order.orderId
        await this.db.ref(`cry/${type}-open-orders`).child(marketNameFb).set(null)
        */
    }

    async InsertOrderFb(order, type){
        
        const total = order.price * order.amount
        const data = {
            orderId: order.id,
            market: order.symbol,
            price: order.price,
            amount: order.amount,
            total: total,
            side: order.side
        }

        await this.openOrders.insertOne(data)

        /*
        const marketNameFb = order.symbol.replace('/','_') + '-' +  order.id
        await this.db.ref(`cry/${type}-open-orders`).child(marketNameFb).set({
            orderId: order.id,
            market: order.symbol,
            price: order.price,
            amount: order.amount,
            total: total
        });
        */
        
    }

    async GetFbData(path){
        return await this.openOrders.find().toArray()
        //return await this.db.ref(path).once('value').then(e => e.val())
    }
    
    async GetOrderBookGroupRest(coin){
        const marketler1 = [
            coin + "/" + this.mainMarkets[0], // ADA/BTC
            coin + "/" + this.mainMarkets[1], // ADA/ETH
            coin + "/" + this.mainMarkets[2] // ADA/DOGE
        ]

        const marketler2 =[
            this.mainMarkets[1] + "/" + this.mainMarkets[0], // ETH/BTC
            this.mainMarkets[2] + "/" + this.mainMarkets[0], // DOGE/BTC
            this.mainMarkets[2] + "/" + this.mainMarkets[1]  // DOGE/ETH
        ]

        const marketler1String = marketler1.map(e=> e.replace('/','_')).join('-')
        const marketler2String = marketler2.map(e=> e.replace('/','_')).join('-')

        const fullUrl1 = `https://www.cryptopia.co.nz/api/GetMarketOrderGroups/${marketler1String}/5`
        const fullUrl2 = `https://www.cryptopia.co.nz/api/GetMarketOrderGroups/${marketler2String}/5`
        const result1 = await rp(fullUrl1).then(e=> JSON.parse(e)).catch(e=> console.log(e))
        const result2 = await rp(fullUrl2).then(e=> JSON.parse(e)).catch(e=> console.log(e))

        if(!result1 || !result2 || !result1.Data || !result2.Data) return await this.GetOrderBookGroupRest(coin);
        if(result1.Data.length < 3 || result2.Data.length < 3) return false

        const marketler = marketler1.concat(marketler2)
        const result = result1.Data.concat(result2.Data)

        let uygunFormat = marketler.map(e=> {
            var market = result.find(x => x.Market == e.replace('/','_')) //  içinde market ismi olan depths gönderiyoruz. orjinalinde yok.
            return { 
                bids: market.Buy ? market.Buy.map(a=> ({ rate: a.Price, amount: a.Volume})) : [], 
                asks: market.Sell.map(a=> ({ rate: a.Price, amount: a.Volume})),
                market: e
            }
        })

       return uygunFormat   
    }

    async GetOrderBooksRest(marketName){
        const market = await this.MarketOrderPost(marketName)
        var data =  { 
            bids: market.Buy.map(a=> ({ rate: a.Price, amount: a.Volume})), 
            asks: market.Sell.map(a=> ({ rate: a.Price, amount: a.Volume})),
            market: marketName
        }
        return data  
    }

    async MarketOrderPost(marketName){
        const fullUrl = `https://www.cryptopia.co.nz/api/GetMarketOrders/${marketName.replace('/','_')}/5`
        const result = await rp(fullUrl).then(e=> JSON.parse(e)).catch(e=> console.log(e))
        if(!result || !result.Data) return await this.MarketOrderPost(marketName)
        return result.Data
    }
    
    async HangiMarketteEnPahaliBuy(coin){ // Buy için en pahalı market
        let history = await this.GetHistory(coin) // coinin en son alındığı fiyatı verir.
        if(!history) return false // history yoksa direk false döndür.

        // marketler sırayla --> ADA/BTC, ADA/ETH, ADA/DOGE ve ETH/BTC, DOGE/BTC
        /*
        const market = await this.HangiMarketteEnPahaliInAllMarkets(coin, history)

        return false
        */
        const altiTickers = await this.GetAltiMarketTickers(coin)
        if(!altiTickers) return false
        const depthsKontrol = Object.keys(altiTickers).filter(e=> !altiTickers[e] || !altiTickers[e].asks || !altiTickers[e].bids) // boş item sayısı 0 dan büyükse false

        if(depthsKontrol.length > 0) return false // eğer 1 market bile yoksa ve depthleri yoksa false dön, çünkü biz 3 markettede olanlarla iş yapıyoruz.
        return this.FindIyiMarketiBuy(altiTickers, history)
    }
    

    FindIyiMarketiBuy(altiTickers, history){ // coinBtc, coinLtc, coinDoge, ethBtc, dogeBtc, dogeLtc
        const {coinBtc, coinLtc, coinDoge, ethBtc, dogeBtc, dogeLtc} = altiTickers
        // marketler sırayla --> ADA/BTC, ADA/ETH, ADA/DOGE ve ETH/BTC, DOGE/BTC, DOGE/ETH
        const totalBtc = this.GetMarketTotal(coinBtc, 'buy') // ADA/BTC  ->  bu hesaplamayı bunda yapacağımız ana coin. diğerlerini buna çevireceğimizden bunu birşeye çevirmemize gerek yok.
        const totalLtc = this.GetMarketTotal(coinLtc, 'buy') // ADA/ETH  ->  1000 ada x ETH yapar değeri. ETH değer
        const toalDoge = this.GetMarketTotal(coinDoge, 'buy') // ADA/DOGE ->  1000 ada x Doge yapar değeri. DOGE değer  ### BUY çünkü doge de sell e bakarsak hepsinde doge çıkar.

        const ethBtcTotal = ethBtc.bids[0]['rate'] * totalLtc    // ETH/BTC  değeri, yukarıdaki totalLtc  nin BTC değeri
        const dogeBtcTotal = dogeBtc.bids[0]['rate'] * toalDoge  // DOGE/BTC değeri, yukarıdaki totalDoge nin BTC değeri.

        const dogeLtcTotal = dogeLtc.bids[0]['rate'] * toalDoge  // DOGE/ETH değeri, yukarıdaki toalDoge  nin ETH değeri.
        const dogeLtcBtcTotal = ethBtc.bids[0]['rate'] * dogeLtcTotal  // DOGE/ETH nin ETH/BTC değeri , BTC değeri.
        
        coinBtc.total = totalBtc
        coinLtc.total = ethBtcTotal 
        coinDoge.total = [dogeBtcTotal, dogeLtcBtcTotal].sort((a,b)=> b - a)[0] // coin/doge -> doge/btc ve coin/doge -> doge/eth -> eth/btc var hangisi büyükse onu koyacak.

        const historyTotal = history.btcPrice * 100 // test amount

        const uygunBuyMarkets = [coinBtc, coinLtc, coinDoge].filter(e=> { // aldığım fiyattan büyük olacak ama en az %1 yoksa zarar ederiz. 
            const yuzde = (e.total - historyTotal) / historyTotal * 100
            return yuzde > 1
        })

        if(uygunBuyMarkets.length > 0){
            const marketsSort = uygunBuyMarkets.sort((a,b)=> b.total - a.total) // buyların arasında en büyüğünü alıyoruz eğer 1 den fazla market varsa.
            marketsSort[0].type = 'bids' // sell kurarken priceyi buydanmı sell denmi alsın diye kontrol
            return marketsSort[0]
        }else{
            return false
        }

    }

    async HangiMarketteEnPahali(coin){
        // marketler sırayla --> ADA/BTC, ADA/ETH, ADA/DOGE ve ETH/BTC, DOGE/BTC
        const altiTickers = await this.GetAltiMarketTickers(coin)
        if(!altiTickers) return false
        const depthsKontrol = Object.keys(altiTickers).filter(e=> !altiTickers[e] || !altiTickers[e].asks || !altiTickers[e].bids) // herhangi biri boşsa veya asks veya bids i boşsa false true

        if(depthsKontrol > 0) return false // eğer 1 market bile yoksa ve depthleri yoksa false dön, çünkü biz 3 markettede olanlarla iş yapıyoruz.
        return this.FindIyiMarketiSell(altiTickers)
    }

    FindIyiMarketiSell(altiTickers){ // coinBtc, coinLtc, coinDoge, ethBtc, dogeBtc, dogeLtc
        const {coinBtc, coinLtc, coinDoge, ethBtc, dogeBtc, dogeLtc} = altiTickers
        // marketler sırayla --> ADA/BTC, ADA/ETH, ADA/DOGE ve ETH/BTC, DOGE/BTC, DOGE/ETH
        const totalBtc = this.GetMarketTotal(coinBtc) // ADA/BTC  ->  bu hesaplamayı bunda yapacağımız ana coin. diğerlerini buna çevireceğimizden bunu birşeye çevirmemize gerek yok.
        const totalLtc = this.GetMarketTotal(coinLtc) // ADA/ETH  ->  1000 ada x ETH yapar değeri. ETH değer
        const toalDoge = this.GetMarketTotal(coinDoge, 'buy') // ADA/DOGE ->  1000 ada x Doge yapar değeri. DOGE değer  ### BUY çünkü doge de sell e bakarsak hepsinde doge çıkar.

        const ethBtcTotal = ethBtc.asks[0]['rate'] * totalLtc    // ETH/BTC  değeri, yukarıdaki totalLtc  nin BTC değeri
        const dogeBtcTotal = dogeBtc.asks[0]['rate'] * toalDoge  // DOGE/BTC değeri, yukarıdaki totalDoge nin BTC değeri.

        const dogeLtcTotal = dogeLtc.asks[0]['rate'] * this.GetMarketTotal(coinDoge)  // DOGE/ETH değeri, ETH doge karşılaştırması için sell alıyoruz. yukarıdaki toalDoge  nin ETH değeri.
        const dogeLtcBtcTotal = ethBtc.asks[0]['rate'] * dogeLtcTotal  // DOGE/ETH nin ETH/BTC değeri , BTC değeri.
        
        coinBtc.total = totalBtc
        coinLtc.total = ethBtcTotal 
        coinDoge.total = [dogeBtcTotal, dogeLtcBtcTotal].sort((a,b)=> b - a)[0] // coin/doge -> doge/btc ve coin/doge -> doge/eth -> eth/btc var hangisi büyükse onu koyacak.

        const markets = [coinBtc, coinLtc, coinDoge]
        return this.VolumeKontrol(markets)
    }

     
    VolumeKontrol(markets){
        const vUygunlar = markets.filter(e=> this.marketTickers.Data.find(a=> a.Label == e.market && a.Volume > 0)) // Bu volumesi uygun marketleri alır.

        const uygunMarket = vUygunlar.sort((a,b)=> b.total - a.total)[0] // b-a büyükten küçüğe
        if(!uygunMarket){
            const vsizUygunMarket = markets.sort((a,b)=> b.total - a.total)[0]
            console.log(`Manuel satılması gereken coin: >>>>>  market: >>>>> ${vsizUygunMarket.market} `)
            return false
        }
        uygunMarket.type = 'asks' // sell kurarken priceyi buydanmı sell denmi alsın diye kontrol
        return uygunMarket || false // sıraya dizdikten sonra ilk en BÜYÜK marketi döndürüyoruz.
    }
        
    GetTotalDoge(coin, etn, firstMainCoin, thirdMainCoin, type, orderBooks ){
        const d = {
            coin,
            type,
            alisMarketName: coin + '/' + thirdMainCoin,  // Bu coinin ilk alınacağı yer
            firstMarketName: coin + '/' + firstMainCoin, 
            secondMarketName: etn +'/' + firstMainCoin, 
            thirdMarketName: etn +'/' + thirdMainCoin
        }
        //const list = Object.keys(d).map(e=> d[e])
        //const orderBooks = this.allData.filter(e=> list.includes(e.market))
        const rob = this.GetOrderBookGroup(d, orderBooks) // result order book yani rob
        if(!rob) return false
        const sonuc = this.Kontrol(d, rob)
        if(!sonuc) return false

        d.alisTotal = sonuc.alisTotal
        d.satisTotal = sonuc.satisTotal
        d.fark = sonuc.fark
        d.rob = rob
        return d // sonuç true ise total döndürüyoruz. tani sonuç = total
    }

    GetOrderBookGroup(d, orderBooks){
        const kontrol = this.OrderBooksKontrol(orderBooks, d)
        if(!kontrol) return false

        let { alisOrderBook, firstOrderBook, secondOrderBook, thirdOrderBook } = kontrol
        alisOrderBook = this.SetBook(alisOrderBook, 'asks') 
        firstOrderBook = this.SetBook(firstOrderBook, 'bids') 
        secondOrderBook = this.SetBook(secondOrderBook, 'asks')
        thirdOrderBook = d.type == 'alt' ? this.SetBook(thirdOrderBook, 'asks') : this.SetBook(thirdOrderBook, 'bids') 


        return {alisOrderBook, firstOrderBook, secondOrderBook, thirdOrderBook}
    }

    SetBook(orderBook, type){ 
        return {
            price: Number(orderBook[type][0].rate), 
            total: Number(orderBook[type][0].rate) * Number(orderBook[type][0].amount),
            market: orderBook.market,
            type
        }
    }

    OrderBooksKontrol(orderBooks, d){
        if(orderBooks.length < 4) return false
        const result = this.OrderBooksDataKontrol(orderBooks)
        if(!result) return false

        const alisOrderBook = orderBooks.find(e=> e.market == d.alisMarketName)
        const firstOrderBook = orderBooks.find(e=> e.market == d.firstMarketName)
        const secondOrderBook = orderBooks.find(e=> e.market == d.secondMarketName)
        const thirdOrderBook = orderBooks.find(e=> e.market == d.thirdMarketName)

        if(!alisOrderBook || !firstOrderBook || !secondOrderBook || !thirdOrderBook) return false

        return { alisOrderBook, firstOrderBook, secondOrderBook, thirdOrderBook }
    }

    OrderBooksDataKontrol(orderBooks){
        // order 3 ten küçükse || orderbook boşsa || asks yoksa || bids yoksa || ask 1 satohi ise || sıfırıncı bid yoksa || bid 22 satoshhiden küçükse
        for (const orderBook of orderBooks) {
            const sonuc = !orderBook || !orderBook.asks || !orderBook.asks[0] || orderBook.asks[0].rate == 0.00000001 || !orderBook.bids || !orderBook.bids[0]
            if(sonuc) return false
        }

        return true
    }

    
    GetMarketTotal(market, type = 'sell'){
        if(!market) return 0
        if(market.bids.length == 0) return 0
        const baseCoin = market.market.split('/')[1]
        const ondalikliSayi = this.SetPrices(market.market) // base market price giriyoruz ondalık sayı için
        let total
        if(type == 'sell'){ // sell ise asks price -1, buy ise bids price +1
            total = (market.asks[0]['rate'] - ondalikliSayi) * this.testAmount // coin o markette varsa degerini, yoksa 0 yazsın.
        }else{
            total = (Number(market.bids[0]['rate']) + ondalikliSayi) * this.testAmount // coin o markette varsa degerini, yoksa 0 yazsın.
        }
        
        if(baseCoin == 'BTC' && market.asks[0]['rate'] < 0.0000000021) return 0 // basecoin BTC ise ve price 21 satoshiden küçükse bunu geç. 0 döndür.
        return total
    }

    
    GetMarketTotalForBuy(market, type = 'sell'){
        if(!market) return 0
        if(market.bids.length == 0) return 0
        const rate = type == 'sell' ? market.asks[0]['rate'] : market.bids[0]['rate']
        let total = Number(rate) * this.testAmount
        return total
    }

    Kontrol(d, rob){
        const { alisOrderBook, firstOrderBook, secondOrderBook, thirdOrderBook } = rob
        const alisMainCoin = d.alisMarketName.split('/')[1]
        const firstMainCoin = d.firstMarketName.split('/')[1]
        const secondMainCoin = d.secondMarketName.split('/')[1]
        const thirdMainCoin = d.thirdMarketName.split('/')[1]
        const marketNames = [d.alisMarketName, d.firstMarketName, d.secondMarketName, d.thirdMarketName]
        const aktifMarketSayisi = this.marketsInfos.filter(a=> marketNames.includes(a.symbol) && a.active)
        if(aktifMarketSayisi.length != 4) return false // 3 markette aktif değilse false dön.

        const alisTotal = alisOrderBook.price * this.testAmount  
        const firstTotal = firstOrderBook.price * this.testAmount    // ADA/DOGE ->  1000 ada x Doge yapar değeri. DOGE değer 
        const amountSecond = firstTotal / secondOrderBook.price         // DOGE/ETH değeri, yukarıdaki toalDoge  nin ETH değeri.
        const satisTotal = thirdOrderBook.price * amountSecond               // ETH/BTC değeri , BTC değeri.
        if(satisTotal < alisTotal) return false
        const checkTamUygun = alisOrderBook.total >= this.limits[alisMainCoin] && firstOrderBook.total >= this.limits[firstMainCoin] && secondOrderBook.total >= this.limits[secondMainCoin] && thirdOrderBook.total >= this.limits[thirdMainCoin] // CHECK TAM UYGUN
        if(satisTotal < alisTotal || !checkTamUygun) return false
        const fark = (satisTotal -  alisTotal) / alisTotal * 100
        if(fark < 1) return false
        return {alisTotal, satisTotal, fark}
    }

    async HangiMarketteEnPahaliInAllMarkets(coin, history){
        // marketler sırayla --> ADA/USDT, ADA/BTC, ADA/ETH ve BTC/USDT, ETH/USDT
        let allData = await this.GetOrderBooks(null, true) // null market listesi burada boş veriyoruz, all true çünkü bütün datayı alıyoruz.
        if(!allData) return false
        allData = allData.filter(e=>{
            const sonuc = e.asks && e.asks[0] && e.asks[0].rate != 0.00000001 && e.bids && e.bids[0] && e.bids[0].rate > 0.00000021  
            return sonuc
        })

        this.allData = allData
        
        const historyTotal = history.btcPrice * 100 // test amount
        const marketTotaller = this.MarketTotalleriGetir(coin)
        if(!marketTotaller) return false
        const {coinBtc, coinLtc, coinDoge, btcTotal, ethTotal, dogeTotal} = marketTotaller
        
        const uygunBuyMarkets = [coinBtc, coinLtc, coinDoge, btcTotal, ethTotal, dogeTotal].filter(e=> { // aldığım fiyattan büyük olacak ama en az %1 yoksa zarar ederiz. 
            const yuzde = (e.total - historyTotal) / historyTotal * 100
            return yuzde > 1
        })

        if(uygunBuyMarkets.length > 0){
            const marketsSort = uygunBuyMarkets.sort((a,b)=> b.total - a.total) // buyların arasında en büyüğünü alıyoruz eğer 1 den fazla market varsa.
            marketsSort[0].type = 'bids' // sell kurarken priceyi buydanmı sell denmi alsın diye kontrol
            //return marketsSort[0]
            console.log(coin + ' için buy var:', marketsSort)
            return false
        }else{
            return false
        }

    }

    MarketTotalleriGetir(coin){
        //const allCoins = this.marketsInfos.filter(e=> e.quote == 'BTC').map(e=>e.baseId.toUpperCase()).filter(e=> !this.mainMarkets.includes(e))
        let coinBtc, coinLtc, coinDoge, ethBtcMarket, dogeBtcMarket

        const length = this.allData.length
        for (let i = 0; i < length; i++) {
            switch (this.allData[i].market) {
                case coin + '/BTC':
                    coinBtc = this.allData[i]
                    break;
                case coin + '/ETH':
                    coinLtc = this.allData[i]
                    break;
                case coin + '/DOGE':
                    coinDoge = this.allData[i]
                    break;
                case 'ETH/BTC':
                    ethBtcMarket = this.allData[i]
                    break;
                case 'DOGE/BTC':
                    dogeBtcMarket = this.allData[i]
                    break;
                default:
                    break;
            }
            
        }
        const coinMarkets = [coinBtc, coinLtc, coinDoge, ethBtcMarket, dogeBtcMarket]
        const dataKontrol = this.OrderBooksDataKontrol(coinMarkets)
        if(!dataKontrol || coinMarkets.length < 5) return false
        const totalBtc = this.GetMarketTotalForBuy(coinBtc, 'buy')
        const totalLtc = this.GetMarketTotalForBuy(coinLtc, 'buy')
        const totalDoge = this.GetMarketTotalForBuy(coinDoge, 'buy')
        coinBtc.total = totalBtc
        coinLtc.total = totalLtc * ethBtcMarket.bids[0].rate
        if(coinLtc.total < this.limits['BTC']){
            coinLtc.total =  0
        }
        coinDoge.total = totalDoge * dogeBtcMarket.bids[0].rate
        if(coinDoge.total < this.limits['BTC']){
            coinDoge.total = 0
        }
        
        const totalListBtc = []
        const totalListLtc = []
        const totalListDoge = []
        let resultBtc, resultLtc, resultDoge
        for (const etn of this.allActiveCoins) {
            if(coin == etn) continue
            const marketList = [ coin + '/BTC', coin+'/ETH', coin+'/DOGE', etn + '/BTC', etn+'/ETH', etn+'/DOGE']
        
            const orderBooks = this.allData.filter(e=> marketList.includes(e.market)) 
            
            resultBtc = this.GetTotalDoge(coin, etn, 'DOGE', 'BTC', 'ust', orderBooks)
            if(resultBtc) totalListBtc.push(resultBtc)

            resultBtc = this.GetTotalDoge(coin, etn, 'ETH', 'BTC', 'ust', orderBooks)
            if(resultBtc) totalListBtc.push(resultBtc)
            //
            resultLtc = this.GetTotalDoge(coin, etn, 'BTC', 'ETH', 'ust', orderBooks)
            if(resultLtc) totalListLtc.push(resultLtc)

            resultLtc = this.GetTotalDoge(coin, etn, 'DOGE', 'ETH', 'ust', orderBooks)
            if(resultLtc) totalListLtc.push(resultLtc)
            //
            resultDoge = this.GetTotalDoge(coin, etn, 'BTC', 'DOGE', 'ust', orderBooks)
            if(resultDoge) totalListDoge.push(resultDoge)

            resultDoge = this.GetTotalDoge(coin, etn, 'ETH', 'DOGE', 'ust', orderBooks)
            if(resultDoge) totalListDoge.push(resultDoge)

        }

        const btcTotal = totalListBtc.sort((a,b)=> b.satisTotal - a.satisTotal)[0] || 0

        const ethTotal = totalListLtc.sort((a,b)=> b.satisTotal - a.satisTotal)[0] || 0
        if(ethTotal != 0){
            ethTotal.satisTotal =  ethTotal.satisTotal * ethBtcMarket.bids[0].rate
        }
        

        const dogeTotal = totalListDoge.sort((a,b)=> b.satisTotal - a.satisTotal)[0] || 0
        if(dogeTotal != 0){
            dogeTotal.satisTotal = dogeTotal.satisTotal * dogeBtcMarket.bids[0].rate
        }

        const btcDenKarliMarket = [btcTotal, ethTotal, dogeTotal].sort((a,b)=> b.satisTotal - a.satisTotal)[0] 
        if(btcDenKarliMarket == 0) return false
        return btcDenKarliMarket
        
    }

    async UygunMarketEkle(d, rob){
        const uygunMarket = {
            firstMarket:  { name: d.firstMarketName,  price: rob.firstOrderBook.price,  total: rob.firstOrderBook.total },
            secondMarket: { name: d.secondMarketName, price: rob.secondOrderBook.price, total: rob.secondOrderBook.total },
            thirdMarket:  { name: d.thirdMarketName,  price: rob.thirdOrderBook.price,  total: rob.thirdOrderBook.total, type: d.type },
            //btcMarket:    { name: d.btcMarketName,    price: rob.btcOrderBook.price,    total: rob.btcOrderBook.total }
        }

        await this.BuySellBuyBasla(uygunMarket)         
    }

    BaseCoinAmountTotalGetir( firstMarket, secondMarket ){
        let baseCoin, amount, total, price
        let firstAmount = firstMarket.total / firstMarket.price // tofixed yerine round
        let secondAmount = secondMarket.total / secondMarket.price // tofixed yerine round
        firstAmount = Number(firstAmount.toFixed(8))
        secondAmount = Number(secondAmount.toFixed(8))

        if(firstAmount < secondAmount){
            amount = firstAmount
            total = firstMarket.total
            price = firstMarket.price
            baseCoin = firstMarket.name.split('/')[1]
        }else{
            amount = secondAmount
            total = secondMarket.total
            price = secondMarket.price
            baseCoin = secondMarket.name.split('/')[1]
        }

        total = Number(total.toFixed(8))

        const barajTotal = this.ortak.limits[baseCoin] * this.islemKati

        if(total > barajTotal){
            amount = barajTotal / price
            amount = Number(amount.toFixed(8))
        }

        return { baseCoin, amount, total }
    }

    async BuySellBuyBasla(market){
        const { firstMarket, secondMarket, btcMarket } = market
        const altCoin = firstMarket.name.split('/')[0]
        let { baseCoin, amount, total } = this.BaseCoinAmountTotalGetir(firstMarket, secondMarket)

        const kontrol = await this.BuyBaslaKontroller(btcMarket, altCoin, baseCoin, total )
        if(!kontrol) return

        const firstSellResult = await this.Submit(market, firstMarket.name, firstMarket.price, amount, 'sell')

        if(firstSellResult){
            const buyResult = await this.SelliBuyYap({ firstSellResult, market, secondMarket, amount, altCoin, btcMarket })
            if(buyResult){
                const secondSellResult = await this.BuyuSellYap({ firstSellResult, market, secondMarket, amount, altCoin, btcMarket })
                if(secondSellResult && secondSellResult.filled < buyResult.filled) await this.OrderIptalEt(buyResult)
            }
        }
    }

    async SelliBuyYap(data){
        const { firstSellResult, market, secondMarket, amount } = data
        let buyResult

        if(firstSellResult.filled && firstSellResult.filled > 0){
            buyResult = await this.Submit(market, secondMarket.name, secondMarket.price, firstSellResult.filled, 'buy')
            if(buyResult && buyResult.filled < buyResult.firstSellResult) await this.OrderIptalEt(buyResult)
        }

        if(!firstSellResult.filled || firstSellResult.filled < amount) await this.OrderIptalEt(firstSellResult)
        
        return buyResult
    }

    async BuyuSellYap(data){
        const { buyResult, market, secondMarket, amount } = data
        let sellResult

        if(buyResult.filled && buyResult.filled > 0){
            sellResult = await this.Submit(market, secondMarket.name, secondMarket.price, buyResult.filled, 'buy')
            if(sellResult && sellResult.filled < buyResult.filled) await this.OrderIptalEt(sellResult)
        }

        if(!buyResult.filled || buyResult.filled < amount) await this.OrderIptalEt(buyResult)
        
        return sellResult
    }



    async Submit(market, marketName, rate, amount, type){ // Bu all daha buy için (üstteki fonksiyon)
        const orderParams = [marketName, 'limit', type, amount, rate]
        
        const submitOrder = await this.ccx.exchange.createOrder(...orderParams).catch(e => {
            market.Hata = e.message
            market.date = new Date()
            this.mailDataHata.insertOne(market)
            console.log(e, orderParams)
        })

        if (submitOrder) {
            console.log(`${marketName} için  ${type} kuruldu.'`)
            return submitOrder
        } else {
            console.log(`${type} Kurarken Hata. market: ${marketName}`)
            return false
        }
    }
}

module.exports = Ortak

