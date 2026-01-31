import { Controller, Get, Post, Query, Body, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  PaymentPostBodyDto,
  PaymentQueryDto,
  SetPaymentMethodDto,
} from './dto';
import { StripeService } from '../stripe/stripe.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('pay')
export class PaymentsController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async postPayRedirect(
    @Body() body: PaymentPostBodyDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const params = new URLSearchParams();
    if (body.public_key != null && body.public_key !== '')
      params.set('public_key', body.public_key);
    if (body.account != null && body.account !== '')
      params.set('account', body.account);
    if (body.sum != null && body.sum !== '') params.set('sum', body.sum);
    if (body.desc != null && body.desc !== '') params.set('desc', body.desc);
    if (body.currency != null && body.currency !== '')
      params.set('currency', body.currency);
    if (body.sign != null && body.sign !== '') params.set('sign', body.sign);
    if (body.ordernum != null && body.ordernum !== '')
      params.set('ordernum', body.ordernum);
    if (body.paySystem != null && body.paySystem !== '')
      params.set('paySystem', body.paySystem);

    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    const baseUrl = `${protocol}://${host}/pay`;
    const queryString = params.toString();
    const redirectUrl = queryString ? `${baseUrl}?${queryString}` : baseUrl;

    res.redirect(303, redirectUrl);
  }

  /**
   * Stripe redirects here after successful payment (return_url).
   * Redirects the user to the partner's redirectUrl from DB.
   */
  @Get('success')
  async getPaySuccess(
    @Query('payment_intent') paymentIntentId: string,
    @Query('redirect_status') redirectStatus: string,
    @Res() res: Response,
  ) {
    if (!paymentIntentId) {
      res
        .status(400)
        .send(
          '<!DOCTYPE html><html><body><h1>Bad Request</h1><p>Missing payment_intent.</p></body></html>',
        );
      return;
    }
    if (redirectStatus !== 'succeeded') {
      res
        .status(400)
        .send(
          '<!DOCTYPE html><html><body><h1>Payment not completed</h1><p>Redirect status: ' +
            (redirectStatus || 'unknown') +
            '</p></body></html>',
        );
      return;
    }
    const payment = await this.prisma.payment.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      include: { user: { include: { userSettings: true } } },
    });
    const partnerRedirectUrl =
      payment?.user?.userSettings?.redirectUrl?.trim() || '';
    if (!partnerRedirectUrl) {
      res
        .status(500)
        .send(
          '<!DOCTYPE html><html><body><h1>Error</h1><p>Redirect URL not configured.</p></body></html>',
        );
      return;
    }
    const params = new URLSearchParams();
    if (payment?.payAccount) params.set('account', payment.payAccount);
    if (payment?.sum) params.set('sum', payment.sum ?? '');
    if (payment?.ordernum) params.set('ordernum', payment.ordernum ?? '');
    if (payment?.amount != null) params.set('amount', String(payment.amount));
    if (payment?.currency) params.set('currency', payment.currency);
    const queryString = params.toString();
    const targetUrl = queryString
      ? (partnerRedirectUrl.includes('?')
          ? partnerRedirectUrl + '&'
          : partnerRedirectUrl + '?') + queryString
      : partnerRedirectUrl;
    res.redirect(302, targetUrl);
  }

  @Get()
  async getPaymentPage(
    @Query() query: PaymentQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Extract and sanitize parameters
    const params = {
      public_key: (query.public_key || '').trim(),
      account: query.account || '',
      sum: query.sum || '0.00',
      desc: query.desc || '',
      currency: query.currency || 'EUR',
      sign: query.sign || '',
      ordernum: query.ordernum || '',
    };

    // Check that public_key exists in DB before continuing payment flow
    if (!params.public_key) {
      res
        .status(400)
        .send(
          '<!DOCTYPE html><html><body><h1>Bad Request</h1><p>Missing public_key.</p></body></html>',
        );
      return;
    }
    const userByPublicKey = await this.prisma.user.findUnique({
      where: { publicKey: params.public_key },
      include: { userSettings: true },
    });
    if (!userByPublicKey) {
      res
        .status(403)
        .send(
          '<!DOCTYPE html><html><body><h1>Forbidden</h1><p>Invalid public_key.</p></body></html>',
        );
      return;
    }

    const callbackUrl = userByPublicKey.userSettings?.callbackUrl?.trim() || '';
    const redirectUrl = userByPublicKey.userSettings?.redirectUrl?.trim() || '';
    if (!callbackUrl || !redirectUrl) {
      res
        .status(400)
        .send(
          '<!DOCTYPE html><html><body><h1>Bad Request</h1><p>Redirect URL and Callback URL must both be configured in account settings.</p></body></html>',
        );
      return;
    }

    // Create Stripe Payment Intent for card payments
    const amount = parseFloat(params.sum) || 0;
    const currency = params.currency || 'EUR';

    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    const returnUrl = protocol + '://' + host + '/pay/success';

    let paymentIntentClientSecret = '';
    let paymentIntentId = '';
    try {
      const paymentIntent = await this.stripeService.createPaymentIntent(
        amount,
        currency,
        {
          account: params.account,
          ordernum: params.ordernum,
          public_key: params.public_key,
          desc: params.desc,
        },
      );
      paymentIntentClientSecret = paymentIntent.client_secret || '';
      paymentIntentId = paymentIntent.id;
      await this.prisma.payment.create({
        data: {
          userId: userByPublicKey.id,
          stripePaymentIntentId: paymentIntent.id,
          amount,
          currency: currency.toUpperCase(),
          status: 'pending',
          payAccount: params.account || null,
          ordernum: params.ordernum || null,
          desc: params.desc || null,
        },
      });
    } catch (error) {
      console.error('Failed to create Payment Intent:', error);
    }

    const stripePublicKey = this.stripeService.getPublicKey();

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      min-height: 100vh;
      background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    
    .payment-card {
      background: white;
      border-radius: 16px;
      padding: 40px;
      max-width: 600px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .title {
      font-size: 24px;
      font-weight: 600;
      color: #1f2937;
    }
    
    .amount {
      font-size: 28px;
      font-weight: 700;
      color: #1f2937;
    }
    
    .description {
      font-size: 14px;
      color: #6b7280;
      margin-top: 8px;
      font-weight: 400;
    }
    
    .content-container {
      position: relative;
      transition: height 0.3s;
    }
    
    .payment-methods {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      transition: opacity 0.3s, transform 0.3s;
      position: absolute;
      width: 100%;
      opacity: 1;
      transform: translateX(0);
    }
    
    .payment-methods.hidden {
      opacity: 0;
      transform: translateX(-20px);
      pointer-events: none;
    }
    
    .payment-tile {
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      background: white;
    }
    
    .payment-tile:hover {
      border-color: #ff6b35;
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(255, 107, 53, 0.2);
    }
    
    .payment-tile img {
      width: 60px;
      height: 60px;
      object-fit: contain;
      margin-bottom: 8px;
    }
    
    .payment-tile span {
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #4b5563;
    }
    
    .card-form-wrapper {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      z-index: 1;
      opacity: 0;
      visibility: hidden;
      transform: translateX(20px);
      pointer-events: none;
      transition: opacity 0.3s, transform 0.3s, visibility 0.3s;
    }
    
    .card-form-wrapper.active {
      z-index: 10;
      opacity: 1;
      visibility: visible;
      transform: translateX(0);
      pointer-events: all;
    }
    
    .wallet-form-wrapper {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      z-index: 1;
      opacity: 0;
      visibility: hidden;
      transform: translateX(20px);
      pointer-events: none;
      transition: opacity 0.3s, transform 0.3s, visibility 0.3s;
    }
    
    .wallet-form-wrapper.active {
      z-index: 10;
      opacity: 1;
      visibility: visible;
      transform: translateX(0);
      pointer-events: all;
    }
    
    #express-checkout-container {
      width: 100%;
      max-width: 750px;
      margin-top: 12px;
    }
    
    .back-button {
      display: flex;
      align-items: center;
      gap: 8px;
      background: none;
      border: none;
      color: #6b7280;
      font-size: 16px;
      cursor: pointer;
      padding: 8px 0;
      margin-bottom: 24px;
      transition: color 0.2s;
    }
    
    .back-button:hover {
      color: #ff6b35;
    }
    
    .back-arrow {
      width: 20px;
      height: 20px;
      display: inline-block;
      position: relative;
    }
    
    .back-arrow::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      width: 12px;
      height: 2px;
      background: currentColor;
      transform: translateY(-50%);
    }
    
    .back-arrow::after {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      width: 8px;
      height: 8px;
      border-left: 2px solid currentColor;
      border-bottom: 2px solid currentColor;
      transform: translateY(-50%) rotate(45deg);
    }
    
    .card-form {
      display: block;
    }
    
    #card-element {
      width: 100%;
      min-height: 48px;
      padding: 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      background: white;
      box-sizing: border-box;
    }
    
    #card-element:focus-within {
      border-color: #ff6b35;
      outline: none;
    }
    
    #card-errors {
      color: #dc2626;
      font-size: 14px;
      margin-top: 8px;
      min-height: 20px;
    }
    
    .form-group {
      margin-bottom: 20px;
    }
    
    .form-group label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
      margin-bottom: 8px;
    }
    
    .form-group input {
      width: 100%;
      padding: 12px;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.2s;
    }
    
    .form-group input:focus {
      outline: none;
      border-color: #ff6b35;
    }
    
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    
    .submit-btn {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .submit-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(255, 107, 53, 0.4);
    }
    
    .submit-btn:active {
      transform: translateY(0);
    }
    
    .submit-btn:disabled,
    .submit-btn[disabled] {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div class="payment-card">
    <div class="header">
      <div>
        <h1 class="title">Payment</h1>
        <div class="description" id="paymentDesc"></div>
      </div>
      <div class="amount" id="paymentAmount"></div>
    </div>
    
    <div class="content-container">
      <div class="payment-methods" id="paymentMethods">
        <div class="payment-tile" data-method="wallet">
          <img src="/icons/wallet.png" alt="Wallet">
          <span>Wallet</span>
        </div>
        <div class="payment-tile" data-method="visa">
          <img src="/icons/visa.png" alt="Visa">
          <span>Visa</span>
        </div>
        <div class="payment-tile" data-method="mastercard">
          <img src="/icons/mastercard.png" alt="MasterCard">
          <span>MasterCard</span>
        </div>
      </div>
      
      <div class="wallet-form-wrapper" id="walletFormWrapper">
        <button type="button" class="back-button" id="backFromWalletButton">
          <span class="back-arrow"></span>
          <span>Back to payment methods</span>
        </button>
        <div id="express-checkout-container"></div>
      </div>
      
      <div class="card-form-wrapper" id="cardFormWrapper">
        <button type="button" class="back-button" id="backButton">
          <span class="back-arrow"></span>
          <span>Back to payment methods</span>
        </button>
        <div class="card-form">
          <form id="paymentForm">
            <div class="form-group">
              <label for="cardNumber">Card Number</label>
              <input type="text" id="cardNumber" name="cardNumber" placeholder="1234 5678 9012 3456" maxlength="19">
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="expiry">Expiry</label>
                <input type="text" id="expiry" name="expiry" placeholder="MM/YY" maxlength="5">
              </div>
              <div class="form-group">
                <label for="cvc">CVC</label>
                <input type="text" id="cvc" name="cvc" placeholder="123" maxlength="4">
              </div>
            </div>
            <div class="form-group">
              <label for="name">Cardholder Name</label>
              <input type="text" id="name" name="name" placeholder="John Doe">
            </div>
            <button type="submit" class="submit-btn" id="submitBtn">Pay</button>
          </form>
        </div>
      </div>
    </div>
  </div>
  
  <script src="https://js.stripe.com/v3/"></script>
  <script>
    // Stripe configuration
    const stripePublicKey = '${stripePublicKey}';
    const stripe = stripePublicKey ? Stripe(stripePublicKey) : null;
    const paymentIntentClientSecret = '${paymentIntentClientSecret}';
    const paymentReturnUrl = ${JSON.stringify(returnUrl)};
    
    // Payment parameters from server
    const paymentParams = ${JSON.stringify(params)};
    const paymentIntentId = ${JSON.stringify(paymentIntentId)};
    let selectedPaySystem = null;
    let cardBrandMatches = false;
    let stripeElements = null;
    let cardElement = null;
    
    const paymentMethods = document.getElementById('paymentMethods');
    const cardFormWrapper = document.getElementById('cardFormWrapper');
    const walletFormWrapper = document.getElementById('walletFormWrapper');
    const backButton = document.getElementById('backButton');
    const backFromWalletButton = document.getElementById('backFromWalletButton');
    const contentContainer = document.querySelector('.content-container');
    const paymentAmountEl = document.getElementById('paymentAmount');
    const paymentDescEl = document.getElementById('paymentDesc');
    const submitBtn = document.getElementById('submitBtn');
    
    // Initialize payment display
    paymentAmountEl.textContent = paymentParams.sum + ' ' + paymentParams.currency;
    paymentDescEl.textContent = paymentParams.desc;
    
    // Map payment methods to Pay4Bit paySystem values and paymentType for API
    const paySystemMap = {
      'wallet': null,
      'visa': 'visa',
      'mastercard': 'mastercard'
    };
    const methodToPaymentType = {
      'wallet': 'wallet',
      'visa': 'visa',
      'mastercard': 'mastercard'
    };
    
    // Function to sync container height with active block
    function syncHeight() {
      let activeEl = paymentMethods;
      if (cardFormWrapper.classList.contains('active')) activeEl = cardFormWrapper;
      else if (walletFormWrapper.classList.contains('active')) activeEl = walletFormWrapper;
      const h = activeEl.scrollHeight;
      contentContainer.style.height = (h + 10) + 'px';
    }
    
    // Call on startup
    syncHeight();
    window.addEventListener('resize', syncHeight);
    
    // When Express Checkout iframe resizes (e.g. after first load), update container height
    var resizeRaf = null;
    var walletResizeObserver = typeof ResizeObserver !== 'undefined' && new ResizeObserver(function() {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(function() {
        resizeRaf = null;
        syncHeight();
      });
    });
    if (walletResizeObserver && walletFormWrapper) {
      walletResizeObserver.observe(walletFormWrapper);
    }
    
    // Notify server of selected payment type (for metadata and DB)
    function setPaymentTypeOnServer(paymentType) {
      if (!paymentIntentId) return;
      fetch('/api/pay/set-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId, paymentType }),
      }).catch(function() {});
    }
    
    // Handle payment method tile clicks
    document.querySelectorAll('.payment-tile').forEach(tile => {
      tile.addEventListener('click', function() {
        const method = this.dataset.method;
        selectedPaySystem = paySystemMap[method];
        const paymentType = methodToPaymentType[method];
        if (paymentType) setPaymentTypeOnServer(paymentType);
        
        if (method === 'wallet') {
          if (stripe && paymentIntentClientSecret) {
            paymentMethods.classList.add('hidden');
            setTimeout(() => {
              walletFormWrapper.classList.add('active');
              initializeWalletPayment();
              syncHeight();
            }, 150);
          } else {
            alert('Payment system not available');
          }
        } else if (method === 'visa' || method === 'mastercard') {
          paymentMethods.classList.add('hidden');
          setTimeout(() => {
            cardFormWrapper.classList.add('active');
            initializeCardPayment();
            syncHeight();
          }, 150);
        }
      });
    });
    
    // Handle back button click (from card form)
    backButton.addEventListener('click', function() {
      cardFormWrapper.classList.remove('active');
      setTimeout(() => {
        paymentMethods.classList.remove('hidden');
        document.getElementById('paymentForm').reset();
        syncHeight();
      }, 300);
    });
    
    // Handle back button click (from wallet)
    backFromWalletButton.addEventListener('click', function() {
      walletFormWrapper.classList.remove('active');
      setTimeout(() => {
        paymentMethods.classList.remove('hidden');
        syncHeight();
      }, 300);
    });
    
    // Format card number input
    document.getElementById('cardNumber').addEventListener('input', function(e) {
      let value = e.target.value.replace(/\\s/g, '');
      let formattedValue = value.match(/.{1,4}/g)?.join(' ') || value;
      e.target.value = formattedValue;
    });
    
    // Format expiry input
    document.getElementById('expiry').addEventListener('input', function(e) {
      let value = e.target.value.replace(/\\D/g, '');
      if (value.length >= 2) {
        value = value.substring(0, 2) + '/' + value.substring(2, 4);
      }
      e.target.value = value;
    });
    
    // Only allow numbers for CVC
    document.getElementById('cvc').addEventListener('input', function(e) {
      e.target.value = e.target.value.replace(/\\D/g, '');
    });
    
    // Initialize Stripe Elements for card payment
    function initializeCardPayment() {
      if (!stripe || !paymentIntentClientSecret) {
        console.error('Stripe not initialized');
        return;
      }

      // Replace manual form with Stripe Elements
      const form = document.getElementById('paymentForm');
      const formHTML = form.innerHTML;
      
      // Create Stripe Elements container
      form.innerHTML = '<div id="card-element"></div><div id="card-errors" role="alert"></div>';
      
      stripeElements = stripe.elements({
        clientSecret: paymentIntentClientSecret,
      });

      cardElement = stripeElements.create('card', {
        hidePostalCode: true,
        style: {
          base: {
            fontSize: '16px',
            color: '#1f2937',
            '::placeholder': {
              color: '#9ca3af',
            },
          },
        },
      });

      cardElement.mount('#card-element');

      cardElement.on('change', (event) => {
        const displayError = document.getElementById('card-errors');
        const payBtn = document.getElementById('submitBtn');
        if (event.error) {
          displayError.textContent = event.error.message;
          if (payBtn) payBtn.disabled = true;
          return;
        }
        // If user chose Visa or Mastercard, accept only that brand
        if (selectedPaySystem === 'visa' || selectedPaySystem === 'mastercard') {
          const brand = (event.brand || '').toLowerCase();
          if (brand && brand !== selectedPaySystem) {
            displayError.textContent = selectedPaySystem === 'visa'
              ? 'Please use a Visa card.'
              : 'Please use a Mastercard.';
            if (payBtn) payBtn.disabled = true;
            cardBrandMatches = false;
            return;
          }
          cardBrandMatches = !!brand;
        } else {
          cardBrandMatches = true;
        }
        displayError.textContent = '';
        if (payBtn) payBtn.disabled = false;
      });

      // Add submit button back (disabled until card is valid and brand matches)
      const submitBtnContainer = document.createElement('div');
      submitBtnContainer.innerHTML = '<button type="submit" class="submit-btn" id="submitBtn" disabled>Pay ' + paymentParams.sum + ' ' + paymentParams.currency + '</button>';
      form.appendChild(submitBtnContainer);
    }

    // Initialize Google Pay / Apple Pay with Express Checkout Element (bound to existing Payment Intent)
    let walletMounted = false;
    let walletElements = null;
    let expressCheckoutElement = null;

    function initializeWalletPayment() {
      if (!stripe || !paymentIntentClientSecret) {
        return;
      }
      if (walletMounted) {
        return;
      }

      var container = document.getElementById('express-checkout-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'express-checkout-container';
        container.style.cssText = 'margin-top: 20px; width: 100%;';
        document.querySelector('.payment-card').appendChild(container);
      }

      walletElements = stripe.elements({
        clientSecret: paymentIntentClientSecret,
      });

      expressCheckoutElement = walletElements.create('expressCheckout', {
        emailRequired: true,
      });

      expressCheckoutElement.mount('#express-checkout-container');
      walletMounted = true;

      expressCheckoutElement.on('confirm', async (event) => {
        const { error: submitError } = await walletElements.submit();
        if (submitError) {
          alert('Payment failed: ' + (submitError.message || 'Unknown error'));
          return;
        }
        const { error } = await stripe.confirmPayment({
          elements: walletElements,
          clientSecret: paymentIntentClientSecret,
          confirmParams: {
            return_url: paymentReturnUrl,
          },
        });
        if (error) {
          alert('Payment failed: ' + (error.message || 'Unknown error'));
        }
      });
    }

    // Mount Express Checkout on page load (in hidden wrapper) so Wallet view opens instantly when clicked
    if (stripe && paymentIntentClientSecret) {
      initializeWalletPayment();
    }

    // Handle form submission with Stripe
    document.getElementById('paymentForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      
      if (!stripe || !cardElement || !paymentIntentClientSecret) {
        alert('Payment system not initialized');
        return;
      }
      if ((selectedPaySystem === 'visa' || selectedPaySystem === 'mastercard') && !cardBrandMatches) {
        alert(selectedPaySystem === 'visa' ? 'Please use a Visa card.' : 'Please use a Mastercard.');
        return;
      }

      const payBtn = document.getElementById('submitBtn');
      if (payBtn) {
        payBtn.disabled = true;
        payBtn.textContent = 'Processing...';
      }

      const {error, paymentIntent} = await stripe.confirmCardPayment(
        paymentIntentClientSecret,
        {
          payment_method: {
            card: cardElement,
          },
        }
      );

      if (error) {
        const btn = document.getElementById('submitBtn');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Pay ' + paymentParams.sum + ' ' + paymentParams.currency;
        }
        alert('Payment failed: ' + error.message);
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        var successUrl = paymentReturnUrl + '?payment_intent=' + encodeURIComponent(paymentIntent.id) + '&redirect_status=succeeded';
        window.location.href = successUrl;
      }
    });
    
    submitBtn.textContent = 'Pay ' + paymentParams.sum + ' ' + paymentParams.currency;
  </script>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  }

  /**
   * Set selected payment type (visa, mastercard, applepay, googlepay) before user confirms.
   * Called from payment page when user clicks a payment method tile.
   */
  @Post('set-method')
  async setPaymentMethod(
    @Body() body: SetPaymentMethodDto,
  ): Promise<{ ok: boolean }> {
    const { paymentIntentId, paymentType } = body;
    const pi = await this.stripeService.getPaymentIntent(paymentIntentId);
    const metadata = { ...(pi.metadata || {}), paymentType };
    await this.stripeService.updatePaymentIntentMetadata(
      paymentIntentId,
      metadata,
    );
    await this.prisma.payment.updateMany({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { paymentType },
    });
    return { ok: true };
  }

  /**
   * Create Payment Intent endpoint (if needed separately)
   */
  @Post('create-intent')
  async createPaymentIntent(
    @Body()
    body: {
      amount: number;
      currency: string;
      metadata?: Record<string, string>;
    },
  ) {
    const paymentIntent = await this.stripeService.createPaymentIntent(
      body.amount,
      body.currency,
      body.metadata,
    );
    return {
      clientSecret: paymentIntent.client_secret,
    };
  }
}
