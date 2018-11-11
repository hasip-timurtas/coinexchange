md_ws.onmessage = function(evt) {

    var data = JSON.parse(evt.data);



    // Sell Orders Update
    if(data.type == "update_sell_order"){
        updateSellOrders(data.direction, data.price, data.quantity, data.total);
    }
    // Buy Order Update
    if(data.type == "update_buy_order"){
        updateBuyOrders(data.direction, data.price, data.quantity, data.total);
    }
};

 function updateSellOrders (Direction, Price, Quantity, Total){
    var arr = this.sell_orders();
    var found = 0;
  
    for (i = 0; i < arr.length; i++) {
        if(arr[i].price == Price){
            found = 1;
            var new_entry = {};
            if(Direction == "remove"){
                if(+arr[i].quantity > +Quantity){
                    new_entry.price = Price;
                    new_entry.quantity = +arr[i].quantity - +Quantity;
                    new_entry.total = Price * new_entry.quantity;
                    removeSellOrder(Price);
                    addsellOrder(new_entry.price, new_entry.quantity, new_entry.total);
                    sortSellOrders();
                }  else if(+arr[i].quantity == +Quantity) {
                    removeSellOrder(Price);
                }
            } else if(Direction == "add"){
                new_entry.price = Price;
                new_entry.quantity = +arr[i].quantity + +Quantity;
                new_entry.total = Price * new_entry.quantity;
                removeSellOrder(Price);
                addsellOrder(new_entry.price, new_entry.quantity, new_entry.total);
                sortSellOrders();
            }
            i = arr.length;
            
        } 
    }
    
    if(found == 0){
        if(Direction == "add"){
            var new_total = +Price * +Quantity;
            addsellOrder(Price, Quantity, new_total);
            sortSellOrders();
        }
    }
    // update sell ask
    
    var ask = arr[0].price;
    updateAskPrice(ask);
}

function removeSellOrder (Price) {
    self.sell_orders.remove(function(sell_order) {
        return sell_order.price == Price;
    });
}

function addsellOrder (price, quantity, total) {
    price = Number(price).toFixed(8);
    quantity = Number(quantity).toFixed(8);
    total = Number(total).toFixed(8);
    self.sell_orders.push({price: price, quantity: quantity, total: total, userorder: 0});
};

function sortSellOrders() {
    this.sell_orders.sort(function (left, right) { return left.price == right.price ? 0 : (left.price < right.price ? -1 : 1) });
    //this.updateTotal();
};


function updateBuyOrders(Direction, Price, Quantity, Total){
    var arr = this.buy_orders();
    var found = 0;
    for (i = 0; i < arr.length; i++) {
        if(arr[i].price == Price){
            found = 1;
            var new_entry = {};
            if(Direction == "remove"){
                if(+arr[i].quantity > +Quantity){
                    new_entry.price = Price;
                    new_entry.quantity = +arr[i].quantity - +Quantity;
                    new_entry.total = Price * new_entry.quantity;
                    removeBuyOrder(Price);
                    addBuyOrder(new_entry.price, new_entry.quantity, new_entry.total);
                    sortBuyOrders();
                }  else if(+arr[i].quantity == +Quantity) {
                    removeBuyOrder(Price);
                }
            } else if(Direction == "add"){
                new_entry.price = Price;
                new_entry.quantity = +arr[i].quantity + +Quantity;
                new_entry.total = Price * new_entry.quantity;
                removeBuyOrder(Price);
                addBuyOrder(new_entry.price, new_entry.quantity, new_entry.total);
                sortBuyOrders();
            }
            i = arr.length;
        } 
    }
    if(found == 0){
        if(Direction == "add"){
            var new_total = +Price * +Quantity;
            addBuyOrder(Price, Quantity, new_total);
            sortBuyOrders();
        }
    }
    var bid = arr[0].price;
    updateBidPrice(bid);
}

function removeBuyOrder (Price) {
    self.buy_orders.remove(function(buy_order) {
        return buy_order.price == Price;
    });
}

function addBuyOrder (price, quantity, total) {
    price = Number(price).toFixed(8);
    quantity = Number(quantity).toFixed(8);
    total = Number(total).toFixed(8);
    self.buy_orders.push({price: price, quantity: quantity, total: total, userorder: 0});
};

function sortBuyOrders () {
    this.buy_orders.sort(function (left, right) { return left.price == right.price ? 0 : (left.price > right.price ? -1 : 1) });
    //this.updateTotal();
};