import { NextRequest, NextResponse } from "next/server";
import {getAccount, getAssociatedTokenAddress, getMint } from "@solana/spl-token"
import { connection, getSupportedTokens } from "@/lib/constants";
import {  LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

async function getAccountBalance(token:{
    name:string,
    mint:string,
    native:boolean
},address:string) {
    if(token.native){
        const balance = await connection.getBalance( new PublicKey(address))
        return balance / LAMPORTS_PER_SOL
    }

    //ata = associated token account
    //pda = program derived address
    const ata = await getAssociatedTokenAddress(new PublicKey(token.mint),  new PublicKey(address))
    try {
        const account = await getAccount(connection, ata)
        const mint = await getMint(connection, new PublicKey(token.mint))
        return Number(account.amount) / (10 ** mint.decimals)
    } catch {
        // No ATA yet (wallet never held this token) → balance is 0
        return 0
    }
}


function getPrice(){
    

}

export async function GET(req:NextRequest){
    const {searchParams} = new URL(req.url)
    const address= searchParams.get('address') as string   
    const supportedTokens = await getSupportedTokens()
    const balances = await Promise.all(supportedTokens.map(token=> getAccountBalance(token, address)))
    
    return NextResponse.json({
        token: supportedTokens.map((token,index)=> ({
            ...token,
            balance:balances[index]

        }))
    })

}

