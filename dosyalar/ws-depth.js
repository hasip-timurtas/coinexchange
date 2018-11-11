const rp = require('request-promise')
const WebSocket = require('ws');

class WsDepth {
    async LoadVeriables(ortak) {
        this.islemKati = 10
        this.minFark = 1
        this.islemdekiCoinler = []
        this.ortak = ortak
        //setInterval(async ()=> await this.BalanceGuncelle(), 2000 )
        this.balances = []
        this.oncekiCoin = null
        this.depths = []
        this.orderBookCount = 20
        this.subSayac = 0
        this.wsUrl = 'wss://ws.coinexchange3.com:3001/marketdata'
        this.wsler = []
    }

    async GetMarkets(){
        const allTickers = await this.ortak.ccx.GetMarkets().catch(async (e)=>{
            if(e.message.includes('per second')){
                await this.ortak.sleep(11)
            }
            console.log(e)
        } )
        if(!allTickers || !allTickers.Data) return await this.GetMarkets()
        return allTickers.Data
    }

    async PrepareDbAndGetUygunMarkets(){
        let allTickers = await this.GetMarkets()
        const allMarkets = allTickers.map(e=> e.Label)
        const mainMarkets = ['ETH/BTC', 'DOGE/ETH', 'DOGE/BTC']
        const yasakliMarkets = ['ETC', 'LTC']

        const umFilter = allTickers.filter(x=>{
            const coin = x.Label.split('/')[0]
            const baseCoin = x.Label.split('/')[1]
            const markets = [coin + '/BTC', coin + '/ETH', coin + '/DOGE']
            if(mainMarkets.includes(x.Label)) return true
            if(yasakliMarkets.includes(baseCoin)) return false
            const butunMarketlerdeVar = x.Volume > 0.01 // allMarkets.includes(markets[0]) && allMarkets.includes(markets[1]) && allMarkets.includes(markets[2]) && 
            return butunMarketlerdeVar
        })

        this.ortak.depths = umFilter.map(x=> ({ tradePairId: x['TradePairId'], market: x['Label']}))
    }

    async WsBaslat(callback){
        
        this.WsZamanlayici(callback)
        console.log('WS Başlıyor');
        await this.PrepareDbAndGetUygunMarkets()
        //this.ortak.depths = this.ortak.depths.filter(e=> [101].includes(e.tradePairId))
        const leng = this.ortak.depths.length
        for(var i=0; i < leng; i++){
            await this.DbOrderbookDoldur(this.ortak.depths[i])
            this.subSayac = this.subSayac + 1
            console.log(this.subSayac + ' market eklendi. Tolam market: '+ leng)
        }
        this.ortak.wsDataProcessing = false
        console.log('OrderBooks atama işlemi bitti. Tarih: '+ new Date());   
    }

    WsZamanlayici(callback){
        setTimeout(() => {
            for (const ws of this.wsler) {
                ws.close()
            }
            this.ortak.wsDataProcessing = true
            this.ortak.depths = []
            this.subSayac = 0
            this.WsBaslat(callback)
        }, 1000 * 60 * this.ortak.wsZamanlayici) // salisel * saniye * dk
    }

    SingleWs(tradePairId){
        const ws = new WebSocket(this.wsUrl);
        ws.tradePairId = tradePairId
        ws.onmessage = (evt) => {
            var data = JSON.parse(evt.data);
            //console.log(tradePairId, data)
            const params = {}
            
            // Sell Orders Update
            if(data.type == "update_sell_order"){
                this.updateSellOrders(data.direction, data.price, data.quantity, 'asks', tradePairId).catch(e=> console.log(e))
            }
            // Buy Order Update
            if(data.type == "update_buy_order"){
                this.updateBuyOrders(data.direction, data.price, data.quantity, 'bids', tradePairId).catch(e=> console.log(e))
            }
        }

        ws.onerror = (err) => console.log(err)
        ws.onclose= () => console.log(tradePairId+' WS KAPANDI')
        ws.onopen = () =>{
            const orderBookMessage = '{ "type": "join_channel", "market_id": "'+tradePairId+'", "ws_auth_token":"" }'
            ws.send(orderBookMessage)            
        }
        this.wsler.push(ws)
    }

    async DbOrderbookDoldur(depth){
        await this.ortak.ccx.exchange.fetchOrderBook(depth.market)
        .then(market=>{
            let bids = market.bids.map(e=> ({ rate:e[0], amount:e[1], type:'bids'}))
            bids = bids.slice(0, this.orderBookCount) // ilk 5 kayıt.
            let asks = market.asks.map(e=> ({ rate:e[0], amount:e[1], type:'asks'}))
            asks = asks.splice(0, this.orderBookCount) // ilk 5 kayıt
            this.ortak.depths.find(e=> e.market == depth.market).depths = { bids, asks}
            this.SingleWs(depth.tradePairId)
        }).catch(async (e)=>{
            if(e.message.includes('per second')){
                await this.ortak.sleep(11)
            }
            console.log('DbOrderbookDoldurBesMarkets Hata verdi tekrar başlıcak. HATA: ',e)
            this.DbOrderbookDoldur(depth)
        })
        
    }

    /////////////////////////////////////////////////////////
    
    async updateSellOrders (Direction, Rate, Amount, Type, tradePairId){
        let newDepths = this.ortak.depths.find(e=> e.tradePairId == tradePairId).depths
        let arr = newDepths.asks
        var found = 0
        const removeSellOrder = (Rate) => {
            arr = arr.filter(e=> e.rate != Rate)
        }
        
        const addsellOrder = (rate, amount, total) => {
            rate = Number(rate).toFixed(8)
            amount = Number(amount).toFixed(8)
            total = Number(total).toFixed(8)
            arr.push({rate: rate, amount: amount, total: total, userorder: 0})
        }
        
        const sortSellOrders = () => {
            arr.sort((left, right) => left.rate == right.rate ? 0 : (left.rate < right.rate ? -1 : 1) )
        }

        for (let i = 0; i < arr.length; i++) {
            if(arr[i].rate == Rate){
                found = 1
                var new_entry = {}
                if(Direction == "remove"){
                    if(+arr[i].amount > +Amount){
                        new_entry.rate = Rate
                        new_entry.amount = +arr[i].amount - +Amount
                        new_entry.total = Rate * new_entry.amount
                        removeSellOrder(Rate)
                        addsellOrder(new_entry.rate, new_entry.amount, new_entry.total)
                        sortSellOrders()
                    }  else if(+arr[i].amount == +Amount) {
                        removeSellOrder(Rate)
                    }
                } else if(Direction == "add"){
                    new_entry.rate = Rate
                    new_entry.amount = +arr[i].amount + +Amount
                    new_entry.total = Rate * new_entry.amount
                    removeSellOrder(Rate)
                    addsellOrder(new_entry.rate, new_entry.amount, new_entry.total)
                    sortSellOrders()
                }
                i = arr.length
                
            } 
        }
        
        if(found == 0){
            if(Direction == "add"){
                var new_total = +Rate * +Amount
                addsellOrder(Rate, Amount, new_total)
                sortSellOrders()
            }
        }

        newDepths.asks = arr

        this.ortak.depths.find(e=>{
            if(e.tradePairId == tradePairId){
                e.depths = newDepths
                return true
            }
        })

        this.LogYaz(tradePairId,newDepths)
    }
       
    
    async updateBuyOrders(Direction, Rate, Amount, Type, tradePairId){
        let newDepths = this.ortak.depths.find(e=> e.tradePairId == tradePairId).depths
        let arr = newDepths.bids
        var found = 0
        const removeBuyOrder = (Rate) => {
            arr = arr.filter(e=> e.rate != Rate)
        }
        
        const addBuyOrder = (rate, amount, total) => {
            rate = Number(rate).toFixed(8)
            amount = Number(amount).toFixed(8)
            total = Number(total).toFixed(8)
            arr.push({rate: rate, amount: amount, total: total, userorder: 0})
        }
        
        const sortBuyOrders = () => {
            arr.sort((left, right) => left.rate == right.rate ? 0 : (left.rate > right.rate ? -1 : 1) )
        }

        for (let i = 0; i < arr.length; i++) {
            if(arr[i].rate == Rate){
                found = 1
                var new_entry = {}
                if(Direction == "remove"){
                    if(+arr[i].amount > +Amount){
                        new_entry.rate = Rate
                        new_entry.amount = +arr[i].amount - +Amount
                        new_entry.total = Rate * new_entry.amount
                        removeBuyOrder(Rate)
                        addBuyOrder(new_entry.rate, new_entry.amount, new_entry.total)
                        sortBuyOrders()
                    }  else if(+arr[i].amount == +Amount) {
                        removeBuyOrder(Rate)
                    }
                } else if(Direction == "add"){
                    new_entry.rate = Rate
                    new_entry.amount = +arr[i].amount + +Amount
                    new_entry.total = Rate * new_entry.amount
                    removeBuyOrder(Rate)
                    addBuyOrder(new_entry.rate, new_entry.amount, new_entry.total)
                    sortBuyOrders()
                }
                i = arr.length
            } 
        }
        if(found == 0){
            if(Direction == "add"){
                var new_total = +Rate * +Amount
                addBuyOrder(Rate, Amount, new_total)
                sortBuyOrders()
            }
        }
        
        newDepths.bids = arr
        this.ortak.depths.find(e=>{
            if(e.tradePairId == tradePairId){
                e.depths = newDepths
                return true
            }
        })

        this.LogYaz(tradePairId,newDepths)
    }

    LogYaz(tradePairId, depths){
        if(tradePairId == 1010){
            var logSell = depths.asks.map(e=> Number(e.rate).toFixed(8)).join('\n')
            var logBids = depths.bids.map(e=> Number(e.rate).toFixed(8)).join('\n')
            console.log('------\n'+logBids+'\n------')
            console.log('------\n'+logSell+'\n------')
        }
    }

}

module.exports = WsDepth
