//
//  CryptoTestViewModel.swift
//  paymentgateway-sample
//
//  Created by thann phearum on 14/11/25.
//

import SwiftUI
import Foundation
import cpg_framework

class CryptoTestViewModel: ObservableObject {
    
    // MARK: - Published Properties
    
    @Published var resultOutput: String = "Test results will appear here."
    @Published var isRunning: Bool = false
    
    // MARK: - Constants (Matching Android Example)
    
    private let hashParams: [String: String] = [
        "amount": "1000",
        "externalId": "myExternalId004",
        "ccy": "KHR",
        "qrTemplate": "BG_RED"
    ]
    private let hashApiKey = "your_hash_key_here"
    
    private let signatureDataToSign = "Hello server from client"
    // Use a placeholder key for the demonstration
    private let signaturePrivateKeyB64 = "MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCDqYKQfLr+ohFP6yV0jfT9hZNpyWHxOSzbC4J1ngkTM+D+mxu5gV/5uA1HysfLSDvym8/Mb8O8oOE+ckKtZb1F4bbZXbQoXiOLxw05mRwT7QwB3PuRp78kdRdOjcHi3gjc0QXbWkjBsrYEddvX+xqvL7v8r6ILk23rBH3C/P1wtBQacm3GxCcr7ZeUi6XYKLEoby1IGPNZEL9Qg5SQwPQDfx91LpA6aHszIBgz6OfVS1Hl3ZyAmrHnt9Zlw12xCj5dEEHGKrnpBWIykQh8ke0njaJvvTPQyYJtlbszRTQCx4pyh82Eo0OL6LlnO4Dl8PAi2k5SuZ3XK0nvhgi7oBUPAgMBAAECggEAalGl53txnVHOXRTr6BUCMv98rL48YwjimffPX59AgMsx8yfZ2ZEJqaPgxYqQkC1Ci4Ua5mGSVG4ttbma8l7n2tiMSTcL1lU+qw8QNOTY8ZZITfDfDR3CknQjYAHFAah+y6HW8u0TN6dSqINsBhr1z2Xijghd+K8S4ed8jsqw9iKsWVGPYk/14wBaIabEvEOYtSG79U+hRMgtONf07Taul1j4ltXaTkezuc6+M4s8MUf0fUYd5JZfLc+VpvDwr+CB4zHD9WTy/I/VsqFayEuazt4TET3vFxvRnFXlb/BGlTYO89upWdGpv1Bf6bJFcK+WWkQvb/I0hfjKcFhrGjwZ8QKBgQC53yQK95uLwmJQ3osyX2HeXMi0PN7AnuBSwPy3QWVDT6ajmzKygGACPtSM/kfFITXOE5i4QKcXwg+3ok/5Haq/orp6XGCy+WgYrql89viWEhCL+SDt97OXvH6rH4tis4e0dX/6JQznlNlDHLyJ6YSG6ezhkLGAo/8JU4Vzp9+F2wKBgQC1Vmo3aNVYrBDHyiZOU3DSMTFipthz5L2k9+kDu14SNnvtU3TImzqlHwuB6Sn7+TVdaD339pjsUA6Ovp7JCugj89BK7xxTw7T/ltoZok07+6mtqVlVI3WsMWgqjC+VjUybCB1dfZ9DEUwgKs+KBqAPC8X+FuE6wUbk79kX3XjF3QKBgHvEGOTwoXN7mSnONhPxrWJ6l+5kRdMvN6IC/YQtGHestwJkGmr/zm5QVgoYW8Po7EHvjJbL/jd0sjCN9QClf4ghnFhT4NPr/SPKUfNzJG4RU1FRL1slwEF+cz4RQCgV8Xv5baEsQJ6H3++vV9/hTazkYSaFyZwmF3GnWsp7cvxXAoGAVM3iBKHBTKPDgTvXqD+7foFFAEbY6XIrApBx563jc48Ja9bgwcReq8QWBJ4/ZTiJrXJHsMQhhjp2ZGlfJtQz9kRawACM9duLtRAeVWiiyA+MrcuKHJfluy6r8WH4Cu+2yLYFzagnKB1ZxZ1fy8QHbKHr6UVX9btX5U8J7vBDP/0CgYA2wq7AP6hptYKi+PiJurMnsbKR0DqFNmXr9qRO+bVasc3GhjvjzQIBTIIzIIE68JLusAbrwAcLbL/6o/fhQWdTFp9Ws4HzUG406CXFIb8RPdCGuZfm8aGwifbGZe/hqWTt5tqsMfFKcQnZXrRhp+xWx1sEWEnbwIm25aneOfLAjQ=="

    // MARK: - Public Methods
    
    let security = SecurityWrapper.shared
    
    @MainActor
    func performHashTest() {
        self.isRunning = true
        self.resultOutput = "Calculating hash..."
        
        // Use a Task for concurrent background execution (Swift's modern equivalent of a background thread)
        Task {
            do {
                // 1. Concatenate the parameters (ApiHashUtils handles the ordered retrieval)
                let sortedParamsString = sortAndHashParams(params: hashParams)
                
                // 2. Build the final payload with the current timestamp
                let timestampMs = Int64(Date().timeIntervalSince1970 * 1000)
                let finalPayload = sortedParamsString + String(timestampMs) + hashApiKey
                
                // 3. Calculate the hash
                let finalHash = security.hash(finalPayload)

                if finalHash.isEmpty {
                    // Since SecurityUtils.hash returns "" on failure (data encoding),
                    // we throw an error if the hash is empty.
                    throw NSError(domain: "HashError", code: 3, userInfo: [NSLocalizedDescriptionKey: "Hash calculation failed: returned empty string."])
                }

                
                // 4. Update UI (automatically run on the MainActor)
                self.resultOutput = """
                --- SHA-256 HASH RESULT ---

                Sorted Params: \(sortedParamsString)
                Timestamp: \(timestampMs)
                Final Payload:
                \(finalPayload)

                Final Hash:
                \(finalHash)
                """
                
            } catch {
                // Update UI with error
                self.resultOutput = "ERROR (HASH): \(error.localizedDescription)"
            }
            self.isRunning = false
        }
    }
    
    @MainActor
    func performSignatureTest() {
        self.isRunning = true
        self.resultOutput = "Calculating signature..."
        
        Task {
            switch security.sign(data: signatureDataToSign, privateKey: signaturePrivateKeyB64) {
            case .success(let signature):
                self.resultOutput = """
                --- RSA SIGNATURE RESULT ---

                Data: \(signatureDataToSign)

                Signature:
                \(signature)
                """
                print("RSA Signature: \(signature)")
            case .failure(let error):
                print("Signing failed: \(error.localizedDescription)")
                self.resultOutput = "ERROR (SIGNATURE): \(error.localizedDescription)"
            }                // Update UI
            
            self.isRunning = false
        }
    }
    
   func sortAndHashParams(params: [String: String]) -> String {
            // Since Swift Dictionaries are unordered, we use an explicit key array
            // that matches the required order of the Java LinkedHashMap.
            let keyOrder = ["amount", "externalId", "ccy", "qrTemplate"]
            
            return keyOrder
                .compactMap { params[$0] }
                .joined()
        }
}
