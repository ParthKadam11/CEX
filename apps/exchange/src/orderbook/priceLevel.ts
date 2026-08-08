/*
Includes:
addOrder(order) 
peekFirst()
removeFirst()
removeOrder(orderId)
getTotalVolume()
getOrderCount()
isEmpty()
*/

import { Order } from "@cex/exchange-types";

export class PriceLevel{
    price:number;
    orders:Order[]=[]


    constructor(price:number){
        this.price=price
    }

    //adding order to end of queue
    addOrder(order:Order):void{
        this.orders.push(order)
    }

    //get first unmatched order
    peekFirst():Order | undefined{
        return this.orders[0]
    }

    //remove fully matched order from front
    removeFirst():Order | undefined{
        return this.orders.shift()
    }
    
    //remove order by orderId
    removeOrder(orderId:string):boolean{
        const index=this.orders.findIndex((o)=>(o.orderId===orderId))
        if(index!==-1){
            this.orders.splice(index,1)
            return true
        }
        return false
    }

    //get total quantity 
    getTotalVolume():number{
        return this.orders.reduce((sum,o)=>sum+(o.quantity-o.filledQuantity),0)
    }

    //get number of orders at this price
    getOrderCount():number{
        return this.orders.length
    }

    //check if price level is empty
    isEmpty():boolean{
        return this.orders.length === 0
    }
} 
