//
//  ContentView.swift
//  paymentgateway-sample
//
//  Created by thann phearum on 14/11/25.
//
import SwiftUI

struct ContentView: View {
    
    @StateObject private var viewModel = CryptoTestViewModel()
    
    var body: some View {
        VStack(spacing: 20) {
            
            Text("Security Class Testing")
                .font(.title2)
                .bold()
            
            Button {
                viewModel.performSignatureTest()
            } label: {
                Text("Test Signature")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.blue)
            
            Button {
                viewModel.performHashTest()
            } label: {
                Text("Test Hashing")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.blue)
            
            if viewModel.isRunning {
                ProgressView()
            }
            
            ScrollView {
                Text(viewModel.resultOutput)
                    .font(.custom("Menlo", size: 14))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(8)
                    .textSelection(.enabled)
                    .lineLimit(nil)
            }
        }
        .padding()
    }
}

#Preview {
    ContentView()
}
