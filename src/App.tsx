import { useEffect, useMemo, useState } from "react";
import {
  Asset,
  Horizon,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import {
  isConnected,
  requestAccess,
  signTransaction,
} from "@stellar/freighter-api";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;
const server = new Horizon.Server(HORIZON_URL);

type Token = { code: string; issuer?: string; name: string; color: string };
type PathRecord = {
  destination_amount: string;
  destination_asset_type: string;
  destination_asset_code?: string;
  destination_asset_issuer?: string;
  path: Array<{ asset_type: string; asset_code?: string; asset_issuer?: string }>;
};

const XLM: Token = { code: "XLM", name: "Stellar Lumens", color: "#8b9cff" };
const starterTokens = [XLM];
const assetFor = (token: Token) =>
  token.code === "XLM" ? Asset.native() : new Asset(token.code, token.issuer!);
const tokenKey = (token: Token) => token.code === "XLM" ? "native" : `${token.code}:${token.issuer}`;
const amount = (value: string) => Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 7 });
const shortAddress = (value: string) => value ? `${value.slice(0, 6)}…${value.slice(-5)}` : "";

export default function App() {
  const [tokens, setTokens] = useState<Token[]>(starterTokens);
  const [from, setFrom] = useState<Token>(XLM);
  const [to, setTo] = useState<Token>(XLM);
  const [sendAmount, setSendAmount] = useState("10");
  const [wallet, setWallet] = useState("");
  const [balance, setBalance] = useState("—");
  const [quote, setQuote] = useState<PathRecord | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("Connect a Freighter wallet to start swapping on testnet.");
  const [noticeType, setNoticeType] = useState<"info" | "success" | "error">("info");
  const [assetCode, setAssetCode] = useState("");
  const [assetIssuer, setAssetIssuer] = useState("");
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [slippage, setSlippage] = useState("1");

  const receiveAmount = quote?.destination_amount ?? "";
  const price = useMemo(() => {
    const input = Number(sendAmount);
    const output = Number(receiveAmount);
    return input > 0 && output > 0 ? (output / input).toFixed(6) : "—";
  }, [sendAmount, receiveAmount]);

  function notify(message: string, type: "info" | "success" | "error" = "info") {
    setNotice(message);
    setNoticeType(type);
  }

  async function refreshBalance(publicKey: string) {
    try {
      const account = await server.loadAccount(publicKey);
      const native = account.balances.find((item) => item.asset_type === "native");
      setBalance(native ? amount(native.balance) : "0");
    } catch {
      setBalance("0");
    }
  }

  async function connectWallet() {
    try {
      const connection = await isConnected();
      if (!connection.isConnected) {
        notify("Install or unlock the Freighter wallet extension, then try again.", "error");
        return;
      }
      const access = await requestAccess();
      if (access.error) throw new Error(String(access.error));
      const publicKey = access.address;
      if (!publicKey) throw new Error("Wallet access was not granted.");
      setWallet(publicKey);
      await refreshBalance(publicKey);
      notify("Wallet connected to Stellar Testnet.", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not connect wallet.", "error");
    }
  }

  useEffect(() => {
    if (wallet) void refreshBalance(wallet);
  }, [wallet]);

  useEffect(() => {
    setQuote(null);
    const input = Number(sendAmount);
    if (!wallet || !from || !to || from.code === to.code && from.issuer === to.issuer || !Number.isFinite(input) || input <= 0) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingQuote(true);
      try {
        const paths = await server.strictSendPaths(assetFor(from), sendAmount, [assetFor(to)]).call();
        const records = paths.records as PathRecord[];
        if (!cancelled) {
          const best = records.sort((a, b) => Number(b.destination_amount) - Number(a.destination_amount))[0];
          setQuote(best ?? null);
          if (!best) notify("No swap route found for this pair and amount.", "info");
        }
      } catch (error) {
        if (!cancelled) {
          setQuote(null);
          notify(error instanceof Error ? error.message : "Unable to fetch a route from Horizon.", "error");
        }
      } finally {
        if (!cancelled) setLoadingQuote(false);
      }
    }, 450);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [wallet, from, to, sendAmount]);

  function addAsset() {
    const code = assetCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,12}$/.test(code) || !assetIssuer.trim().startsWith("G")) {
      notify("Enter a valid asset code and a Stellar G… issuer public key.", "error");
      return;
    }
    if (tokens.some((token) => token.code === code && token.issuer === assetIssuer.trim())) {
      notify("That asset is already in your list.", "info");
      return;
    }
    const token = { code, issuer: assetIssuer.trim(), name: code, color: "#43d6b0" };
    setTokens((current) => [...current, token]);
    setTo(token);
    setAssetCode("");
    setAssetIssuer("");
    setShowAddAsset(false);
    notify(`${code} added to your local asset list.`, "success");
  }

  async function executeSwap() {
    if (!wallet || !quote) return;
    setBusy(true);
    try {
      const account = await server.loadAccount(wallet);
      const fee = await server.fetchBaseFee();
      const minReceive = (Number(quote.destination_amount) * (1 - Number(slippage) / 100)).toFixed(7);
      const path = quote.path.map((item) =>
        item.asset_type === "native" ? Asset.native() : new Asset(item.asset_code!, item.asset_issuer!),
      );
      const transaction = new TransactionBuilder(account, {
        fee: String(fee),
        networkPassphrase: NETWORK_PASSPHRASE,
      })
        .addOperation(Operation.pathPaymentStrictSend({
          sendAsset: assetFor(from),
          sendAmount,
          destination: wallet,
          destAsset: assetFor(to),
          destMin: minReceive,
          path,
        }))
        .setTimeout(180)
        .build();

      const signed = await signTransaction(transaction.toXDR(), {
        networkPassphrase: NETWORK_PASSPHRASE,
        address: wallet,
      });
      if (signed.error) throw new Error(String(signed.error));
      if (!signed.signedTxXdr) throw new Error("Wallet did not return a signed transaction.");
      const result = await server.submitTransaction(
        TransactionBuilder.fromXDR(signed.signedTxXdr, NETWORK_PASSPHRASE),
      );
      notify(`Swap submitted successfully · ${result.hash.slice(0, 14)}…`, "success");
      await refreshBalance(wallet);
      setQuote(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transaction failed.";
      notify(message.includes("op_no_path") ? "No viable path exists for this swap." : message, "error");
    } finally {
      setBusy(false);
    }
  }

  function flipPair() {
    setFrom(to);
    setTo(from);
    setQuote(null);
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark">✳</span><span>orbit<span className="brand-dot">.</span></span></a>
        <nav><a className="active" href="#swap">Swap</a><a href="#how">How it works</a><a href="https://developers.stellar.org/" target="_blank" rel="noreferrer">Developers ↗</a></nav>
        <div className="top-actions"><span className="network-pill"><i /> Stellar Testnet</span><button className="connect-btn" onClick={connectWallet}>{wallet ? shortAddress(wallet) : "Connect wallet"}</button></div>
      </header>

      <section className="hero">
        <div className="eyebrow"><span className="eyebrow-line" /> BUILT ON STELLAR <span className="testnet-tag">TESTNET</span></div>
        <h1>Trade at the<br /><span>speed of light.</span></h1>
        <p className="hero-copy">A simpler way to swap assets on Stellar.<br />Non-custodial, transparent, and built for the open network.</p>
      </section>

      <section className="workspace" id="swap">
        <div className="swap-card">
          <div className="card-heading"><div><span className="card-kicker">EXCHANGE</span><h2>Swap assets</h2></div><button className="settings-btn" title="Swap settings" onClick={() => setSlippage(slippage === "1" ? "0.5" : "1")}>⚙</button></div>
          <div className="field-label"><span>You pay</span><span>Balance: {wallet ? balance + " XLM" : "—"}</span></div>
          <div className="token-field">
            <input aria-label="Amount to send" inputMode="decimal" value={sendAmount} onChange={(event) => setSendAmount(event.target.value.replace(/[^0-9.]/g, ""))} />
            <select aria-label="Asset to send" value={tokenKey(from)} onChange={(event) => setFrom(tokens.find((token) => tokenKey(token) === event.target.value)!)}>{tokens.map((token) => <option key={tokenKey(token)} value={tokenKey(token)}>{token.code}</option>)}</select>
          </div>
          <button className="flip-btn" onClick={flipPair} aria-label="Reverse swap direction">↕</button>
          <div className="field-label"><span>You receive</span><span>{loadingQuote ? "Finding best route…" : "Estimated amount"}</span></div>
          <div className="token-field receive-field">
            <div className="receive-amount">{receiveAmount ? amount(receiveAmount) : "0.00"}</div>
            <select aria-label="Asset to receive" value={tokenKey(to)} onChange={(event) => setTo(tokens.find((token) => tokenKey(token) === event.target.value)!)}>{tokens.map((token) => <option key={tokenKey(token)} value={tokenKey(token)}>{token.code}</option>)}</select>
          </div>
          <div className="quote-details">
            <div><span>Rate</span><b>{price === "—" ? "—" : `1 ${from.code} ≈ ${price} ${to.code}`}</b></div>
            <div><span>Slippage tolerance</span><button className="slippage" onClick={() => setSlippage(slippage === "1" ? "0.5" : "1")}>{slippage}%</button></div>
            <div><span>Network</span><b>Stellar Testnet</b></div>
          </div>
          <button className="swap-btn" disabled={!wallet || !quote || busy || loadingQuote || from.code === to.code && from.issuer === to.issuer} onClick={executeSwap}>{busy ? <><span className="spinner" /> Confirm in wallet…</> : !wallet ? "Connect wallet to swap" : loadingQuote ? "Finding best route…" : quote ? "Swap assets ↗" : "Enter amount to get a quote"}</button>
          <div className={`notice ${noticeType}`}><span>{noticeType === "success" ? "✓" : noticeType === "error" ? "!" : "ⓘ"}</span>{notice}</div>
          <div className="card-foot"><span>Powered by Stellar Horizon</span><span>◈ Non-custodial</span></div>
        </div>
        <aside className="side-panel">
          <div className="side-card balance-card"><div className="side-title">YOUR TESTNET WALLET <span className="live-dot" /></div><div className="wallet-balance">{wallet ? balance : "—"} <small>XLM</small></div><p>{wallet ? shortAddress(wallet) : "Connect Freighter to view your balance"}</p><button className="text-link" onClick={() => window.open("https://laboratory.stellar.org/#account-creator?network=test", "_blank", "noreferrer")}>Get test XLM from Friendbot ↗</button></div>
          <div className="side-card"><div className="side-title">ASSET LIST <button className="add-asset" onClick={() => setShowAddAsset(!showAddAsset)}>+ Add asset</button></div>{tokens.map((token) => <div className="asset-row" key={tokenKey(token)}><span className="coin-icon" style={{ background: token.color }}>{token.code.slice(0, 1)}</span><span><b>{token.code}</b><small>{token.name}</small></span><span className="asset-network">TESTNET</span></div>)}{showAddAsset && <div className="asset-form"><input placeholder="Asset code e.g. USDC" value={assetCode} onChange={(event) => setAssetCode(event.target.value)} /><input placeholder="Issuer G… public key" value={assetIssuer} onChange={(event) => setAssetIssuer(event.target.value)} /><button onClick={addAsset}>Add token</button></div>}</div>
          <div className="side-card safety-card"><div className="safety-icon">⌁</div><div><b>Testnet only</b><p>Orbit is configured for Stellar Testnet. Test tokens have no real-world value.</p></div></div>
        </aside>
      </section>

      <section className="bottom-info" id="how"><div><span className="info-number">01</span><b>Connect</b><p>Connect your Freighter wallet. Your keys stay with you.</p></div><div><span className="info-number">02</span><b>Choose a route</b><p>Get a live quote from Stellar's path payment markets.</p></div><div><span className="info-number">03</span><b>Swap securely</b><p>Review and sign the transaction in your wallet.</p></div></section>
      <footer><a className="brand footer-brand" href="#"><span className="brand-mark">✳</span><span>orbit<span className="brand-dot">.</span></span></a><span>Built for the Stellar ecosystem · Testnet preview</span><a href="https://github.com/Bossbaby0313/Stellar-Dex" target="_blank" rel="noreferrer">GitHub ↗</a></footer>
    </main>
  );
}
