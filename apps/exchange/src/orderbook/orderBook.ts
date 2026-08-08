/*
TO-DO OrderBook

methods:
  add(order)          
  remove(orderId)       
  getBestBid()           
  getBestAsk()           
  getBbo()           
  getSnapshot(depth) 
  getOrder(orderId)      
  getBids()              
  getAsks() 
*/

import { BookLevel, OrderBookSnapshot, Side, type MarketSymbol, type Order } from "@cex/exchange-types";
import { PriceLevel } from "./priceLevel";

// Stub — implement next
export class OrderBook {
  private symbol :MarketSymbol
  private bids: Map<number, PriceLevel> =new Map()
  private asks: Map<number, PriceLevel> =new Map()
  private orderIndex: Map<string, Order> =new Map()
  
  constructor(symbol: MarketSymbol) {
    this.symbol= symbol;
  }

  //ADD ORDER
  add(order:Order):void{
    const price=order.price
    const book =order.side==Side.BUY? this.bids: this.asks

    //create price level 
    if(!book.has(price)){
      book.set(price, new PriceLevel(price))
    }
    //adding order to pricelevel
    const priceLevel = book.get(price)
    priceLevel?.addOrder(order)
    //add order index
    this.orderIndex.set(order.orderId,order)
  }

  //REMOVE ORDER
  remove(orderId:string):Order|undefined{
    const order= this.orderIndex.get(orderId)
    if(!order) return undefined

    const book = order.side===Side.BUY? this.bids:this.asks
    const priceLevel= book.get(order.price)

    if(priceLevel){
      priceLevel.removeOrder(orderId)
      //also remove empty price level
      if(priceLevel.isEmpty()){
        book.delete(order.price)
      }
    }
    this.orderIndex.delete(orderId)
    return order
  }

  //GET BEST BID (highest price on bid side)
  getBestBid():{price:number, priceLevel:PriceLevel}|null{
    if(this.bids.size===0) return null 

    //get hightest bid price 
    const bestPrice = Math.max(...Array.from(this.bids.keys()))
    return {
      price: bestPrice,
      priceLevel: this.bids.get(bestPrice)!
    }
  }

  //GET BEST ASK (lowest price on ask side)
  getBestAsk():{price:number,priceLevel:PriceLevel}|null{
    if(this.asks.size===0) return null

    //get lowest ask price
    const bestPrice = Math.min(...Array.from(this.asks.keys()))
    return{
      price:bestPrice,
      priceLevel:this.asks.get(bestPrice)!
    }
  }

  //BEST BID OFFER (BBO)
  getBbo():{bestBid:number|null, bestAsk:number|null}{
    const bestBid = this.getBestBid()
    const bestAsk= this.getBestAsk()

    return{
      bestBid:bestBid? bestBid.price:null,
      bestAsk:bestAsk? bestAsk.price:null
    }
  }

  //GET ORDERBOOK SNAPSHOT
  getSnapshot(depth:number=10):OrderBookSnapshot{
    const bids:BookLevel[]=[]
    const asks:BookLevel[]=[]
    
    //GET Bids(DESC best first)
    const bidPrices= Array.from(this.bids.keys()).sort((a,b)=>b-a)
    for(let i=0;i<Math.min(bidPrices.length,depth);i++){
      const pricelevel = this.bids.get(bidPrices[i]!)!
      bids.push({
        price:pricelevel.price,
        quantity:pricelevel.getTotalVolume(),
        count:pricelevel.getOrderCount() 
      })
    } 

    //GET Asks(ASEC best first)
    const askPrices= Array.from(this.asks.keys()).sort((a,b)=>a-b)
    for(let i=0;i<Math.min(askPrices.length,depth);i++){
      const priceLevel= this.asks.get(askPrices[i]!)!
      asks.push({
        price:priceLevel.price,
        quantity:priceLevel.getTotalVolume(),
        count:priceLevel.getOrderCount()
      })
    }

    const bbo =this.getBbo()

    return{
      market:this.symbol,
      bids,
      asks,
      bbo
    }
  }  

  //GET Order
  getOrder(orderId:string):Order|undefined{
    return this.orderIndex.get(orderId)
  }

  //GET All Bids
  getBids():Map<number,PriceLevel>{
    return this.bids
  }

  //GET All Asks
  getAsks():Map<number,PriceLevel>{
    return this.asks
  }
}
