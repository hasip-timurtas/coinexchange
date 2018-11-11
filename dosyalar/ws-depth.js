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
        this.orderBookCount = 10
        this.subSayac = 0
        this.wsUrl = 'wss://ws.coinexchange3.com:3001/marketdata'
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

    async OrderBookInsert(data, callback){
        const depths = this.ortak.depths.find(e=> e.tradePairId == data.TradePairId) //await this.ortak.depths.findOne({ 'tradePairId': data['TradePairId'] })
        if(!depths || !depths.depths.asks || !depths.depths.bids) return
        
        if(data['Type'] == 1 && depths.depths.asks.length > 9 && data.Rate > depths.depths.asks[9].rate) return 
        if(data['Type'] == 0 && depths.depths.bids.length > 9 && data.Rate < depths.depths.bids[9].rate) return 

        let bids = [], asks = [], yeniMix, newDepths
        
        if(depths['depths']['bids'].length > 0)
            bids = depths['depths']['bids']

        if(depths['depths']['asks'].length > 0)
            asks = depths['depths']['asks']

        const mix = bids.concat(asks)
        if(data['Action'] == 0) // add
            yeniMix = this.OrderEkle(data, mix)
        
        if(data['Action'] == 3) // sil (iptal)
            yeniMix = this.OrderSil(data, mix)

        if(data['Action'] == 1) // sil (işlem yapıldı buy yada sell)
            yeniMix = this.OrderSil(data, mix)


        //asks = list(filter(lambda x: x['type'] == 'asks', mix))
        asks = yeniMix.filter(e=> e['type'] == 'asks')
        asks.sort((a,b)=> a.rate - b.rate)
        asks = asks.slice(0, this.orderBookCount)
        //asks.sort()
        //asks = sorted(asks, key=lambda x: x['rate'])

        //bids = list(filter(lambda x: x['type'] == 'bids', mix))
        bids = yeniMix.filter(e=> e['type'] == 'bids')
        bids.sort((a,b)=> b.rate - a.rate)
        bids = bids.slice(0, this.orderBookCount)
        //bids = sorted(bids, key=lambda x: x['rate'],  reverse=True)
        

        newDepths = {'bids': bids, 'asks': asks }

        const depth = this.ortak.depths.find(e=>{
            if(e.tradePairId == data.TradePairId){
                e.depths = newDepths
                return true
            }
        })

        const ratem = yeniMix.find(e=> e['rate'] == data['Rate'])
        const indexim = data['Type'] == 1 ? asks.findIndex(e=> e['rate'] == data['Rate']) :  bids.findIndex(e=> e['rate'] == data['Rate'])

        if(callback && !this.ortak.wsDataProcessing && data.Action == 0 && indexim == 0 && ratem){// #and steamBasla:
            const coin = depth.market.split('/')[0]
            callback(coin)
        }

        

        if(data.TradePairId == 1010){
            var logSell = asks.map(e=> e.rate.toFixed(8)).join('\n')
            var logBids = bids.map(e=> e.rate.toFixed(8)).join('\n')
            console.log('------\n'+logBids+'\n------')
            console.log('------\n'+logSell+'\n------')
        }
    }
    
    OrderEkle(data, orderBooks){
        //rateExist = list(filter(lambda x: x['rate'] == data['Rate'],orderBooks))
        let rateExist = orderBooks.find(e=> e['rate'] == data['Rate'])
        if (rateExist){
            rateExist['amount'] = rateExist['amount'] + data['Amount']
            rateExist['amount'] = Number(rateExist['amount'].toFixed(8))
            orderBooks = orderBooks.filter(e=> e['rate'] != data['Rate']) // eski datayı orderbookstan çıkarıyoruz güncel halini eklicez
            orderBooks.push(rateExist)
        }else{
            const typem = data['Type'] == 1 ? 'asks' : 'bids'
            orderBooks.push({'rate': data['Rate'], 'amount': data['Amount'], 'type': typem })
        }

        return orderBooks
    }

    OrderSil(data, orderBooks){
        if(orderBooks.length == 0) return orderBooks
        const onceLen = orderBooks.length
        //let rateExist = list(filter(lambda x: x['rate'] == data['Rate'],orderBooks))
        let rateExist = orderBooks.find(e=> e['rate'] == data['Rate'])
        if (!rateExist) return orderBooks

        const onceAmount = rateExist['amount']
        rateExist['amount'] = rateExist['amount'] - data['Amount']
        rateExist['amount'] = Number(rateExist['amount'].toFixed(8))
        if (rateExist['amount'] > 0){
            orderBooks = orderBooks.filter(e=> e['rate'] != data['Rate'])
            orderBooks.push(rateExist)
        }else{
            orderBooks = orderBooks.filter(e=> e['rate'] != data['Rate'])

            const sonraLen = orderBooks.length
            if (onceLen == sonraLen && onceAmount == data['Amount'])
                print('huhu')
        }

        return orderBooks
    }

    async WsBaslat(callback){
        /*
        this.WsZamanlayici(callback)
        if(this.ortak.wsDataProcessing && this.ortak.ws){
            console.log('###############################################################    WS ZATEN AÇIK   ############################################################### ')
            this.ortak.ws.close()
        }
        */
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

    SingleWs(tradePairId){
        const ws = new WebSocket(this.wsUrl);
        ws.onmessage = (evt) => {
            var data = JSON.parse(evt.data);
            //console.log(tradePairId, data)
            const params = {}
            
            // Sell Orders Update
            if(data.type == "update_sell_order"){
                params.Type = 1 // 0 buy - 1 Sell
                params.Rate = Number(data.price)
                params.TradePairId = tradePairId
                params.Amount = Number(data.quantity)
                params.Action = data.direction == 'add' ? 0 : 1 // 0 add - 1 sil.
                this.OrderBookInsert(params, null)
                //this.updateSellOrders(data.direction, data.price, data.quantity, data.total);
            }
            // Buy Order Update
            if(data.type == "update_buy_order"){
                params.Type = 0 // 0 buy - 1 Sell
                params.Rate = Number(data.price)
                params.TradePairId = tradePairId
                params.Amount = Number(data.quantity)
                params.Action = data.direction == 'add' ? 0 : 1 // 0 add - 1 sil.
                this.OrderBookInsert(params, null)
                ///this.updateBuyOrders(data.direction, data.price, data.quantity, data.total);
            }
        }

        ws.onerror = (err) => console.log(err)
        ws.onclose= () => console.log(tradePairId+' WS KAPANDI')// bağlantı koptuğunda 2 saniye sonra birdaha bağlan
        ws.onopen = async () =>{
            const orderBookMessage = '{ "type": "join_channel", "market_id": "'+tradePairId+'", "ws_auth_token":"" }'
            ws.send(orderBookMessage)            
        }
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

    WsZamanlayici(callback){
        setTimeout(() => {
            this.ortak.ws.close()
            this.ortak.wsDataProcessing = true
            this.ortak.depths = []
            this.subSayac = 0
            this.WsBaslat(callback)
        }, 1000 * 60 * this.ortak.wsZamanlayici) // salisel * saniye * dk
    }
}

module.exports = WsDepth
