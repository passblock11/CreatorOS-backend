const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const User = require('../models/User');
const ApiLog = require('../models/ApiLog');

class StripeService {
  async logApiCall(userId, action, success, data, error = null) {
    try {
      await ApiLog.create({
        user: userId,
        service: 'stripe',
        action,
        success,
        requestData: data.request,
        responseData: data.response,
        error: error ? { message: error.message, stack: error.stack } : null,
        statusCode: data.statusCode,
        duration: data.duration,
      });
    } catch (err) {
      console.error('Failed to log API call:', err);
    }
  }

  async createCustomer(email, name, userId) {
    const startTime = Date.now();
    
    try {
      const customer = await stripe.customers.create({
        email,
        name,
        metadata: {
          userId: userId.toString(),
        },
      });

      await this.logApiCall(userId, 'create_customer', true, {
        request: { email, name },
        response: { customerId: customer.id },
        statusCode: 200,
        duration: Date.now() - startTime,
      });

      return customer;
    } catch (error) {
      await this.logApiCall(userId, 'create_customer', false, {
        request: { email, name },
        response: error.message,
        statusCode: error.statusCode,
        duration: Date.now() - startTime,
      }, error);
      
      throw error;
    }
  }

  async createCheckoutSession(customerId, priceId, userId, successUrl, cancelUrl) {
    const startTime = Date.now();
    
    try {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        billing_address_collection: 'required',
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          userId: userId.toString(),
        },
      });

      await this.logApiCall(userId, 'create_checkout_session', true, {
        request: { customerId, priceId },
        response: { sessionId: session.id },
        statusCode: 200,
        duration: Date.now() - startTime,
      });

      return session;
    } catch (error) {
      await this.logApiCall(userId, 'create_checkout_session', false, {
        request: { customerId, priceId },
        response: error.message,
        statusCode: error.statusCode,
        duration: Date.now() - startTime,
      }, error);
      
      throw error;
    }
  }

  async createBillingPortalSession(customerId, returnUrl) {
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return session;
    } catch (error) {
      throw error;
    }
  }

  async cancelSubscription(subscriptionId, userId) {
    const startTime = Date.now();
    
    try {
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      await this.logApiCall(userId, 'cancel_subscription', true, {
        request: { subscriptionId },
        response: { status: subscription.status },
        statusCode: 200,
        duration: Date.now() - startTime,
      });

      return subscription;
    } catch (error) {
      await this.logApiCall(userId, 'cancel_subscription', false, {
        request: { subscriptionId },
        response: error.message,
        statusCode: error.statusCode,
        duration: Date.now() - startTime,
      }, error);
      
      throw error;
    }
  }

  async handleWebhook(event) {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutComplete(event.data.object);
        break;
      
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        break;
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  async handleCheckoutComplete(session) {
    try {
      console.log('========================================');
      console.log('💳 [Stripe] Processing checkout.session.completed');
      console.log('Session ID:', session.id);
      console.log('Session metadata:', session.metadata);
      console.log('Customer ID:', session.customer);
      console.log('Subscription ID:', session.subscription);
      console.log('Payment status:', session.payment_status);

      const userId = session.metadata.userId;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      if (!userId) {
        console.error('❌ No user ID in session metadata');
        return;
      }

      if (!subscriptionId) {
        console.error('❌ No subscription ID in checkout session');
        return;
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0].price.id;

      console.log('📊 Retrieved subscription details:');
      console.log('   Subscription ID:', subscription.id);
      console.log('   Status:', subscription.status);
      console.log('   Price ID:', priceId);
      console.log('   Current period end:', new Date(subscription.current_period_end * 1000));
      console.log('🔍 Expected Price IDs:');
      console.log('   Pro:', process.env.STRIPE_PRICE_ID_PRO);
      console.log('   Business:', process.env.STRIPE_PRICE_ID_BUSINESS);

      let plan = 'free';
      if (priceId === process.env.STRIPE_PRICE_ID_PRO) {
        plan = 'pro';
      } else if (priceId === process.env.STRIPE_PRICE_ID_BUSINESS) {
        plan = 'business';
      }

      console.log('✅ Determined plan:', plan.toUpperCase());

      const updateResult = await User.findByIdAndUpdate(userId, {
        'subscription.plan': plan,
        'subscription.status': 'active',
        'subscription.stripeCustomerId': customerId,
        'subscription.stripeSubscriptionId': subscriptionId,
        'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000),
      }, { new: true });

      if (updateResult) {
        console.log(`🎉 [Stripe] Subscription activated successfully!`);
        console.log(`   User ID: ${userId}`);
        console.log(`   Plan: ${plan.toUpperCase()}`);
        console.log(`   Status: ${updateResult.subscription.status}`);
        console.log(`   Period ends: ${updateResult.subscription.currentPeriodEnd}`);
        console.log('========================================');
      } else {
        console.error(`❌ Failed to find user with ID: ${userId}`);
        console.error('========================================');
      }
    } catch (error) {
      console.error('========================================');
      console.error('❌ [Stripe] Error in handleCheckoutComplete:', error);
      console.error('========================================');
      throw error;
    }
  }

  async handleSubscriptionUpdated(subscription) {
    try {
      console.log('========================================');
      console.log('🔄 [Stripe] Processing customer.subscription.updated');
      console.log('   Subscription ID:', subscription.id);
      console.log('   Customer ID:', subscription.customer);
      console.log('   Status:', subscription.status);
      console.log('   Cancel at period end:', subscription.cancel_at_period_end);
      
      const customerId = subscription.customer;
      const user = await User.findOne({ 'subscription.stripeCustomerId': customerId });

      if (!user) {
        console.log(`⚠️ User not found for customer ${customerId}`);
        console.log('========================================');
        return;
      }

      console.log('   Found user:', user._id);
      console.log('   Current plan:', user.subscription.plan);

      // Check subscription status
      const isCancelling = subscription.cancel_at_period_end === true;
      const isCancelled = subscription.status === 'canceled' || subscription.status === 'unpaid';
      const isActive = subscription.status === 'active';
      const isPastDue = subscription.status === 'past_due';

      let plan = 'free';
      let status = 'cancelled';

      // Determine plan and status based on subscription state
      if (isActive && !isCancelling) {
        // Active subscription, determine the plan
        const priceId = subscription.items.data[0].price.id;
        console.log('   Price ID:', priceId);
        
        if (priceId === process.env.STRIPE_PRICE_ID_PRO) {
          plan = 'pro';
        } else if (priceId === process.env.STRIPE_PRICE_ID_BUSINESS) {
          plan = 'business';
        }
        status = 'active';
        console.log('   ✅ Active subscription detected');
      } else if (isActive && isCancelling) {
        // Active but set to cancel - keep plan until period end
        const priceId = subscription.items.data[0].price.id;
        if (priceId === process.env.STRIPE_PRICE_ID_PRO) {
          plan = 'pro';
        } else if (priceId === process.env.STRIPE_PRICE_ID_BUSINESS) {
          plan = 'business';
        }
        status = 'active';
        console.log('   ⚠️ Subscription set to cancel at period end, keeping plan active until then');
      } else if (isPastDue) {
        // Payment failed but still grace period - keep current plan
        plan = user.subscription.plan;
        status = 'past_due';
        console.log('   ⚠️ Payment past due, keeping current plan in grace period');
      } else if (isCancelled) {
        // Cancelled or unpaid - downgrade to free
        plan = 'free';
        status = 'cancelled';
        console.log('   ❌ Subscription cancelled or unpaid, downgrading to free');
      }

      await User.findByIdAndUpdate(user._id, {
        'subscription.plan': plan,
        'subscription.status': status,
        'subscription.stripeSubscriptionId': subscription.id,
        'subscription.currentPeriodEnd': new Date(subscription.current_period_end * 1000),
      });

      console.log(`✅ [Stripe] Subscription updated for user ${user._id}`);
      console.log(`   New plan: ${plan.toUpperCase()}`);
      console.log(`   New status: ${status}`);
      console.log(`   Period ends: ${new Date(subscription.current_period_end * 1000).toISOString()}`);
      console.log('========================================');
    } catch (error) {
      console.error('========================================');
      console.error('❌ [Stripe] Error in handleSubscriptionUpdated:', error);
      console.error('========================================');
    }
  }

  async handleSubscriptionDeleted(subscription) {
    const customerId = subscription.customer;
    const user = await User.findOne({ 'subscription.stripeCustomerId': customerId });

    if (!user) {
      console.log(`User not found for customer ${customerId}`);
      return;
    }

    await User.findByIdAndUpdate(user._id, {
      'subscription.plan': 'free',
      'subscription.status': 'cancelled',
      'subscription.stripeSubscriptionId': null,
    });

    console.log(`Subscription cancelled for user ${user._id}`);
  }

  async handlePaymentFailed(invoice) {
    const customerId = invoice.customer;
    const user = await User.findOne({ 'subscription.stripeCustomerId': customerId });

    if (!user) {
      console.log(`User not found for customer ${customerId}`);
      return;
    }

    await User.findByIdAndUpdate(user._id, {
      'subscription.status': 'past_due',
    });

    console.log(`Payment failed for user ${user._id}`);
  }

  constructWebhookEvent(payload, signature) {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  }
}

module.exports = new StripeService();
