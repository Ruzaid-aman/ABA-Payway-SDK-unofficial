import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'
import { merchant_id, api_key, encryption } from '../../../../helper'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const url = "https://checkout-sandbox.payway.com.kh/api/merchant-portal/merchant-access/payment-link/detail"

    const request_time = new Date().toISOString().replace(/[:-]/g, '').replace(/\..+/, '').slice(0, 14)
    const merchant_auth = {
      'mc_id': merchant_id,
      'id': body.id || 'T+ErECeC9uCGj90ylqGUvw==',
    }

    const merchant_auth_json = JSON.stringify(merchant_auth)
    const merchant_auth_encrypted = encryption(merchant_auth_json, "public_key", 'rsa.public')
    const hash = encryption(request_time + merchant_id + merchant_auth_encrypted, "sha512_true", api_key)

    const request_params = {
      "request_time": request_time,
      "merchant_id": merchant_id,
      "merchant_auth": merchant_auth_encrypted,
      "hash": hash
    }

    const response = await axios.post(url, request_params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    return NextResponse.json({
      request_time,
      merchant_auth_json,
      merchant_auth_encrypted,
      hash,
      response: response.data
    })
  } catch (error: any) {
    return NextResponse.json({
      error: error.response?.data || error.message,
      request_time: new Date().toISOString().replace(/[:-]/g, '').replace(/\..+/, '').slice(0, 14)
    }, { status: 500 })
  }
}