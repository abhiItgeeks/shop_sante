const express = require('express')
const app = express()
const port = 3000
const axios = require('axios');
require('dotenv').config();
const shopURL = process.env.SHOP_URL;
const shopPassword = process.env.SHOP_PASSWORD;
const ThemeID = process.env.THEME_ID;
const bodyParser = require('body-parser')
const cors = require('cors');
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "https://shopsante.ca");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});
app.get('/', (req, res) => {
  res.send(shopPassword)
})
app.get('/hello', (req, res) => {
  res.send('Hello!')
})
app.get("/get-store-locations",async (req, res) => {
  let storeJson = '';
  try{
    await axios.request({
      method: 'get',
      maxBodyLength: Infinity,
      url: `${shopURL}/api/2023-01/themes/${ThemeID}/assets.json?asset[key]=assets/store-locations.json`,
      headers: { 
        'X-Shopify-Access-Token': ''+shopPassword+''
      }
    })
    .then((response) => {
      storeJson = JSON.parse(response.data.asset.value);
    })
    .catch((error) => {
      console.log(error);
    });
  }catch(e){
    console.log("error at getting json file", e)
  }
  res.send({ status: 200, payload: storeJson });
});

async function getStoreLocationsNative(){
  let storeJson;
  try{
    await await axios.request({
      method: 'get',
      maxBodyLength: Infinity,
      url: shopURL+'/api/2023-01/themes/124112601155/assets.json?asset[key]=assets/store-locations.json',
      headers: { 
        'X-Shopify-Access-Token': ''+shopPassword+''
      }
    })
    .then(function (response) {
      storeJson = JSON.parse(response.data.asset.value);
    })
    .catch(function (error) {
      console.log(error);
    })
  }catch(e){
    console.log("error at getting json file", e)
  }

  return storeJson;
}

app.get("/get-orders/:tag/:cursor/:dir/:fullfilment", async (req, res) => {
  let tag = req.params.tag;
  const fullfilment = req.params.fullfilment;
  let dir = "next";
  dir = req.params.dir;
  let cursor;

  //Match old ids with new ids
  const nativeIds = await getStoreLocationsNative();
  const oldLocationId = tag.replace('locationid-','');
  const findById = nativeIds.filter(location => location.oldId == oldLocationId)[0];
  if(findById){
    tag += ` OR shopify-location-id-${findById.locationId}`
  }
  const cursorString = req.params.cursor;
  if(cursorString != "null"){
    cursor = cursorString;
  }
  let orders = null;
  let pageInfo = null;
  let variables;

  if(dir == "next"){
    variables = {
      "cursor": cursor,
      "tag": tag,
      "first": 15,
    }
  }else{
    variables = {
      "before": cursor,
      "tag": tag,
      "last": 15,
    }
  }

  if(fullfilment === "all"){
    variables.tag = tag
  }else{
    variables.tag = `fulfillment_status:${fullfilment} AND ${tag}`
  }
  const query = `query($cursor: String, $tag: String, $first: Int, $last: Int, $before:String){
    orders(last:$last, first:$first, reverse:true, query:$tag after:$cursor, before:$before) {
        edges {
          cursor
            node {
              id
              name
              customer {
                id
                firstName
                lastName
              }
              createdAt
              totalPriceSet{
                shopMoney{
                  amount
                }
              }
              fulfillments {
                id
                status
              }
              displayFinancialStatus
              tags
              email
              shippingAddress{
                phone
              }
              billingAddress{
                phone
              }
              lineItems(first: 50) {
                edges {
                  node {
                    id
                  }
                }
              }
              displayFulfillmentStatus
          }
        }
        pageInfo{
          hasNextPage
          hasPreviousPage
        }
      }
    }`;

  try{
    await fetch(shopURL+'/api/graphql.json', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        'X-Shopify-Access-Token': ''+shopPassword+''
      },
      body: JSON.stringify({query, variables})
    })
    .then(result => {
      return result.json();
    })
    .then(data => {
      if(data.data.orders){
        pageInfo = data.data.orders.pageInfo
      }
      if(data.data.orders){
        orders = data.data.orders.edges;
      }

    });
  }catch(e){
    console.log("error at getting orders", e)
  }

  res.send({ status: 200, payload: orders, pageInfo });
});

app.get("/get-single-order/:id", async (req, res) => {
  const id = req.params.id;
  let order;
  try{
    await fetch(shopURL+'/api/graphql.json', {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        'X-Shopify-Access-Token': ''+shopPassword+''
      },
      body: JSON.stringify({
      query: `
      {
        order(id:"gid://shopify/Order/${id}") {
          id
          name
          createdAt
          customer{
            firstName
            lastName
          }
          email
          phone
          displayFulfillmentStatus
          lineItems(first: 20){
            edges{
              node{
                image{
                  originalSrc
                }
                variantTitle
                quantity
                title
                originalTotalSet{
                  shopMoney{
                    amount
                  }
                }
              }
            }
          }
          subtotalPriceSet{
            shopMoney{
              amount
            }
          }
          totalPriceSet{
            shopMoney{
              amount
            }
          }
          totalDiscountsSet{
            shopMoney{
              amount
            }
          }
          taxLines{
            priceSet{
              shopMoney{
                amount
              }
            }
          }
          shippingAddress{
            address1
            address2
            city
            country
            zip
            phone
          }
          billingAddress{
            firstName
            lastName
            address1
            address2
            city
            country
            zip
            phone
          }
          paymentGatewayNames
          transactions{
            gateway
          }
          displayFulfillmentStatus
        }
      }
      `,
      })
    })
    .then(result => {
      return result.json();
    })
    .then(data => {
      order = data.data.order;
    });
  }catch(e){
    console.log("error at getting orders", e)
  }

  res.send({ status: 200, payload: order });
})

app.get("/fulfill-order/:id", async (req, res) => {
  const id = req.params.id;
  let fulfillment;
  await axios.request({
    method: 'post',
    maxBodyLength: Infinity,
    url: `${shopURL}/api/2022-04/orders/${id}/fulfillments.json`,
    headers: { 
      'X-Shopify-Access-Token': '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'
    },
    data:{
      "fulfillment": {
        "location_id": locationId,
        "tracking_number": null,
        "notify_customer": true
      }
    }
  })
  .then(function (response) {
    fulfillment =  response.data.fulfillment.status;
    console.log("status", fulfillment );
  })
  .catch(function (error) {
    console.log(error);
  })

  res.send({ status: 200, payload: fulfillment });
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})