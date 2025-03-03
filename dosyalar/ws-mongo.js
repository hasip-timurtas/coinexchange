const Ortak = require('./ortak')

class WsMongo {
    async LoadVeriables() {
        this.islemKati = 15
        this.minFark = 1
        this.islemdekiler = []
        this.ortak = new Ortak()
        await this.ortak.LoadVeriables()
        //await this.ortak.LoadVeriables()
        //setInterval(async ()=> await this.BalanceGuncelle(), 2000 )
        setInterval(()=> console.log('Son işlenen: ' + this.sonCoin), 5000 )
        this.balances = []
        this.oncekiCoin = null
        this.orderBookCount = 10
        this.subSayac = 0
        this.steamBasla = false
        this.sonCoin = '1'
    }

    TekliBasla(){
        const allCoins = this.ortak.allActiveCoins
        this.YesYeniFunk('ARB')
    }

    cryWsBasla(){
        this.ortak.wsDepth.WsBaslat(coin=> this.SteamHandler(coin))
    }

    SteamHandler(coin){
        return
        if(this.islemdekiler.includes(coin) || this.ortak.mainMarkets.includes(coin) || this.ortak.wsDataProcessing ) return
        //this.FiyatFarkKontrolYeni(coin, 'BTC', 'ETH', 'DOGE')
        this.YesYeniFunk(coin)
    }

    async YesYeniFunk(coin){
        this.islemdekiler.push(coin)
        const result = this.GetMarketList(coin)
        let allMarkets = await this.ortak.GetOrderBooks(result.marketList)
        if(allMarkets.length < 4) return this.IslemdekilerCikar(coin)

        const data = this.ortak.OrderBooksDataKontrol(allMarkets)
        if(!data){
            console.log('Veritabanında Orderbooks yok ccx ten alınıyor.')
            this.IslemdekilerCikar(coin)
            return
            allMarkets = await this.ortak.GetOrderBookGroupRest(coin)
        }
        const promises = []
        for (const item of result.listForFunction) {
            const orderBooks = allMarkets.filter(e=> item.list.includes(e.market))
            promises.push(this.MarketGir(coin, ...item.list, item.type, orderBooks))
        }

        Promise.all(promises).then(e => this.IslemdekilerCikar(coin)).catch(e=> this.IslemdekilerCikarHataEkle(e, coin))
        this.sonCoin = coin
    }

    async MarketGir(coin, firstMarketName, secondMarketName, thirdMarketName, btcMarketName, type, orderBooks ){
        const d = {coin, firstMarketName, secondMarketName, thirdMarketName, btcMarketName, type }
        const rob = await this.GetOrderBookGroup(d, orderBooks) // result order book yani rob
        if(!rob) return 
        const sonuc = this.Kontrol(d, rob)
        if(sonuc) await this.UygunMarketEkle(d, rob)
    }

    Kontrol(d, rob){
        const { firstOrderBook, secondOrderBook, thirdOrderBook } = rob
        const firstMainCoin = d.firstMarketName.split('/')[1]
        const secondMainCoin = d.secondMarketName.split('/')[1]

        const ourTotal = this.ortak.limits[firstMainCoin]
        const firstMarketAmount = ourTotal / firstOrderBook.price // first market amount' u aldık.
        if(!isFinite(firstMarketAmount)) return false // infinity ise çık

        const secondMarketTotal = firstMarketAmount * secondOrderBook.price // totalimizi aldık. second market total.
        const thirdMarketTotal = d.type == 'alt' ? secondMarketTotal / thirdOrderBook.price : secondMarketTotal * thirdOrderBook.price // alt ise böy, üst se çarp
        const kar = thirdMarketTotal - ourTotal // elde edilen doge ile 10.000 doge arasındaki farka bakıyor. kâr.
        const fark = kar / ourTotal * 100
        const sonuc = fark >= this.minFark
        const checkTamUygun = rob.firstOrderBook.total >= this.ortak.limits[firstMainCoin] && rob.secondOrderBook.total >= this.ortak.limits[secondMainCoin] // CHECK TAM UYGUN

        //if(sonuc && !checkTamUygun) console.log(`Market: ${d.firstMarketName} >  ${d.secondMarketName} # Fark: % ${fark.toFixed(2)}`)
        return sonuc && checkTamUygun
    }

    async UygunMarketEkle(d, rob){
        const uygunMarket = {
            firstMarket:  { name: d.firstMarketName,  price: rob.firstOrderBook.price,  total: rob.firstOrderBook.total },
            secondMarket: { name: d.secondMarketName, price: rob.secondOrderBook.price, total: rob.secondOrderBook.total },
            //thirdMarket:  { name: d.thirdMarketName,  price: rob.thirdOrderBook.price,  total: rob.thirdOrderBook.total, type: d.type },
            btcMarket:    { name: d.btcMarketName,    price: rob.btcOrderBook.price,    total: rob.btcOrderBook.total }
        }

        //await this.BuySellBasla(uygunMarket)         
    }

    async GetOrderBookGroup(d, orderBooks){
        const kontrol = this.OrderBooksKontrol(orderBooks, d)
        if(!kontrol) return false
        const SetBook = (orderBook, type) => ({ price: Number(orderBook[type][0].rate), total: Number(orderBook[type][0].rate) * Number(orderBook[type][0].amount) })
        let { firstOrderBook, secondOrderBook, thirdOrderBook, btcOrderBook } = kontrol

        firstOrderBook = SetBook(firstOrderBook, 'asks') 
        secondOrderBook = SetBook(secondOrderBook, 'bids') 
        btcOrderBook = SetBook(btcOrderBook, 'asks') 
        thirdOrderBook = d.type == 'alt' ? SetBook(thirdOrderBook, 'asks') : SetBook(thirdOrderBook, 'bids') 

        return {firstOrderBook, secondOrderBook, thirdOrderBook, btcOrderBook}
    }

    OrderBooksKontrol(orderBooks, d){
        // order 3 ten küçükse || orderbook boşsa || asks yoksa || bids yoksa || ask 1 satohi ise || sıfırıncı bid yoksa || bid 22 satoshhiden küçükse
        if(orderBooks.length < 3) return false
        for (const orderBook of orderBooks) {
            const sonuc = !orderBook || !orderBook.asks || !orderBook.asks[0] || orderBook.asks[0].rate == 0.00000001 || !orderBook.bids || !orderBook.bids[0] || orderBook.bids[0].rate < 0.00000022  
            if(sonuc) return false
        }

        const firstOrderBook = orderBooks.find(e=> e.market == d.firstMarketName)
        const secondOrderBook = orderBooks.find(e=> e.market == d.secondMarketName)
        const thirdOrderBook = orderBooks.find(e=> e.market == d.thirdMarketName)
        const btcOrderBook = orderBooks.find(e=> e.market == d.btcMarketName)

        if(!btcOrderBook || !firstOrderBook || !secondOrderBook || !thirdOrderBook) return false

        return { firstOrderBook, secondOrderBook, thirdOrderBook, btcOrderBook }
    }

    async BuySellBasla(market){
        const { firstMarket, secondMarket, btcMarket } = market
        const altCoin = firstMarket.name.split('/')[0]
        let { baseCoin, amount, total } = this.BaseCoinAmountTotalGetir(firstMarket, secondMarket)

        const kontrol = await this.BuyBaslaKontroller(btcMarket, altCoin, baseCoin, total )
        if(!kontrol) return

        const buyResult = await this.ortak.SubmitMongo(market, firstMarket.name, firstMarket.price, amount, 'buy')

        if(buyResult) await this.BuyuSellYap({ buyResult, market, secondMarket, amount, altCoin, btcMarket })
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

    BuyBaslaKontroller(btcMarket, altCoin, baseCoin, total ){
        if(total < this.ortak.limits[baseCoin]){
            console.log('Alınacak total yeterli değil');
            return false // total lititten küçükse dön
        }

        const balanceVar = this.BalanceKontrol(btcMarket.price, altCoin)
        if(balanceVar){
            console.log('Yeterince balance var. ÇIK', altCoin)
            return false
        }
        
        return true
    }

    async BuyuSellYap(data){
        const { buyResult, market, secondMarket, amount, altCoin, btcMarket } = data
        let sellResult

            if(buyResult.filled && buyResult.filled > 0){
                sellResult = await this.ortak.SubmitMongo(market, secondMarket.name, secondMarket.price, buyResult.filled, 'sell')
                if(sellResult && sellResult.filled < buyResult.filled){
                    await this.ortak.OrderIptalEt(sellResult)
                    const kalanAmount = buyResult.filled - sellResult.filled
                    this.HistoryEkle(altCoin, kalanAmount, btcMarket.price)
                }
            }

            if(!buyResult.filled || buyResult.filled < amount) await this.ortak.OrderIptalEt(buyResult)
            if(buyResult.filled == 0) return this.MailDataBosBuyInsert(market)

            this.MailDataInsert(market, buyResult, sellResult)
            console.log('##############################     BİR İŞLEM OLDU     ##############################')
    }

    async BalanceGuncelle(){
        const balances = await this.ortak.GetBalance().catch(e=> this.HataEkle(e))
        if(balances){
            this.balances = balances
        }
    }

    BalanceKontrol(anaCoinPrice, altCoin){
        //const balances = await this.ortak.GetBalance()
        let altCoinBalance = this.balances.find(e=> e.Symbol == altCoin) //balances[altCoin]['total']
        if(!altCoinBalance) {
            console.log('#####      Balancekontrol altcoin boş !!!!')
            return true // hata olduğu için balance var dönüyoruz. yani işlem yapmasın.
        } 
        let altCoinTotal = altCoinBalance.Total
        const altCoinBtcDegeri = altCoinTotal * anaCoinPrice
        return altCoinBtcDegeri > this.ortak.limits['BTC']
    }

    async HistoryEkle(altCoin, amount, btcAskPrice ){
        await this.ortak.history.deleteMany({'coin': altCoin})
        await this.ortak.history.insertOne({'coin': altCoin, 'amount': amount, 'btcPrice': btcAskPrice, 'date': new Date() })
    }

    // #################        WEBSOCKET       #################

    MailDataInsert(uygunMarket, buyResult, sellResult){
        this.ortak.mailData.insertOne({uygunMarket, buyResult, sellResult, 'date': new Date()})
    }

    MailDataBosBuyInsert(uygunMarket){
        this.ortak.mailDataBosBuy.insertOne({uygunMarket, hata: 'BUY ALMAYA YETİŞEMEDİ', 'date': new Date()})
    }

    HataEkle(e){
        if(e.message == "Cannot read property 'rate' of undefined") return
        console.log(e.message)
        this.ortak.mailDataHata.insertOne({hata : e.message})
    }

    IslemdekilerCikarHataEkle(e, coin){
        if(e.message == "Cannot read property 'rate' of undefined") return
        console.log(e.message)
        this.ortak.mailDataHata.insertOne({hata : e.message})
        this.IslemdekilerCikar(coin)
    }

    IslemdekilerCikar(coin){
        this.islemdekiler = this.islemdekiler.filter(a => a != coin)
    }

    GetMarketList(coin){
        const marketList = [
            coin + "/" + this.ortak.mainMarkets[0], // ADA/BTC
            coin + "/" + this.ortak.mainMarkets[1], // ADA/ETH
            coin + "/" + this.ortak.mainMarkets[2], // ADA/DOGE
            this.ortak.mainMarkets[1] + "/" + this.ortak.mainMarkets[0], // ETH/BTC
            this.ortak.mainMarkets[2] + "/" + this.ortak.mainMarkets[0], // DOGE/BTC
            this.ortak.mainMarkets[2] + "/" + this.ortak.mainMarkets[1]  // DOGE/ETH
        ]
        // marketList sırasıyla - > ADA/BTC - ADA/ETH - ADA/DOGE - ETH/BTC - DOGE/BTC - DOGE/ETH
        const listForFunction = [
            { list: [ marketList[0], marketList[1], marketList[3], marketList[0] ], type: 'ust' },   // ADA/BTC  - ADA/ETH  - ETH/BTC  - [ADA/BTC]
            { list: [ marketList[0], marketList[2], marketList[4], marketList[0] ], type: 'ust' },   // ADA/BTC  - ADA/DOGE - DOGE/BTC - [ADA/BTC]

            { list: [ marketList[1], marketList[0], marketList[3], marketList[0] ], type: 'alt' },   // ADA/ETH  - ADA/BTC  - ETH/BTC  - [ADA/BTC]
            //{ list: [ marketList[1], marketList[2], marketList[5], marketList[0] ], type: 'ust' },   // ADA/ETH  - ADA/DOGE - DOGE/ETH - [ADA/BTC]

            { list: [ marketList[2], marketList[0], marketList[4], marketList[0] ], type: 'alt' },   // ADA/DOGE - ADA/BTC  - DOGE/BTC - [ADA/BTC]
            //{ list: [ marketList[2], marketList[1], marketList[5], marketList[0] ], type: 'alt' },   // ADA/DOGE - ADA/ETH  - DOGE/ETH - [ADA/BTC]
        ]

        return { marketList, listForFunction }
    }
}


let sayac = 0
let cryBuy
/*
async function Basla(){
    sayac++
    cryBuy = new WsMongo()
    await cryBuy.LoadVeriables()
    cryBuy.ortak.wsZamanlayici = 30 // dakika
    cryBuy.cryWsBasla()
    
    while(cryBuy.ortak.wsDataProcessing){
        await cryBuy.ortak.sleep(1)
    }
    console.log('Sayaç Çalışma süresi: ' + sayac)
}
*/

async function Basla(){
    cryBuy = new WsMongo()
    await cryBuy.LoadVeriables()
    cryBuy.TekliBasla() 
}

Basla()
