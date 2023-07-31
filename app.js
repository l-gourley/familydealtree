const express = require("express");
const app = express();
const path = require("path");
const PORT = 3000;
const mysql = require("mysql");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const sessions = require("express-session");
const bcrypt = require("bcrypt");
const { request } = require("http");

app.set("view engine", "ejs");

app.use(express.static(path.join(__dirname, "/public")));
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));

const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "familydealtree",
  port: "3306",
  multipleStatements: true,
});

const hour = 1000 * 60 * 60 * 1;

app.use(
  sessions({
    secret: "thisisAsecertkey8989",
    saveUninitialized: true,
    cookie: { maxAge: hour },
    resave: false,
  })
);

/* callback function stating whether db connection successful or not*/
connection.connect((err) => {
  if (err) return console.log(err.message);
  console.log("connected to local sql db");
});

//start to listen for request on the following routes
app.get("/", (req, res) => {
  res.redirect("home");
});

app.get("/home", (request, response) => {
let sessionObj = request.session;

let locationTypeFilter = request.query.location_type;
let regionFilter = request.query.region;
let countyFilter = request.query.county;
let datesub = request.query.datesub || new Date()
.toLocaleString("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})
.split("/")
.reverse()
.join("-");
let discountTypeFilter = request.query.discount_type;
let params = [];
let conditions = [];

  let allOffers = `SELECT category, offer.category_id, county.county, offer.county_id, 
                  date_submitted, offer.discount_type_id, discount_type, expiry_date, 
                  offer.location_type_id, location_type, member.username, offer.member_id, offer_code, 
                  offer.merchant_id, merchant.merchant_name, offer_desc, offer_id, 
                  offer_image, offer_name, offer.offer_type_id, offer_url, offer.region_id, region 
                  FROM offer 
                  LEFT JOIN category ON offer.category_id = category.category_id
                  LEFT JOIN county ON offer.county_id = county.county_id
                  LEFT JOIN discount_type ON offer.discount_type_id = discount_type.discount_type_id
                  LEFT JOIN location_type ON offer.location_type_id = location_type.location_type_id
                  LEFT JOIN member ON offer.member_id = member.member_id
                  LEFT JOIN merchant ON offer.merchant_id = merchant.merchant_id
                  LEFT JOIN region ON offer.region_id = region.region_id`;

                  if (locationTypeFilter) {
                    conditions.push("offer.location_type_id = ?");
                    params.push(locationTypeFilter);
                  }
                  if (regionFilter) {
                    conditions.push("offer.region_id = ?");
                    params.push(regionFilter);
                  }
                  if (countyFilter) {
                    conditions.push("offer.county_id = ?");
                    params.push(countyFilter);
                  }
                  if (datesub) {
                    conditions.push("offer.date_submitted <= ?");
                    params.push(datesub);
                  }
                  if (discountTypeFilter) {
                    conditions.push("offer.discount_type_id = ?");
                    params.push(discountTypeFilter);
                  }
                
                  if (conditions.length) {
                    allOffers += " WHERE " + conditions.join(" AND ");
                  }

                  let filterOffers = allOffers + `; SELECT location_type_id, location_type FROM location_type;
                                    SELECT region_id, region FROM region;
                                    SELECT county_id, county FROM county;
                                    SELECT discount_type_id, discount_type FROM discount_type;
                                    SELECT date_submitted FROM offer;`

                  // console.log (filterOffers, params);

  connection.query(filterOffers, params, (err, offerdata) => {
    if (err) throw err;

    let offer = offerdata[0];
    let locationType = offerdata[1];
    let region = offerdata[2];
    let county = offerdata[3];
    let discountType = offerdata[4];


    if (sessionObj.authen) {
      let user = sessionObj.user;
      let userSQL = `SELECT member_id, username, password, email, first_name, last_name, county,
                    country, date_joined FROM member WHERE member_id = ?`;

      connection.query(userSQL, [user], (err, userinfo) => {
        if (err) throw err;
        response.render("home", { offer, userdata: userinfo, user, locationType, region, county, discountType });
      });
    } else {
      response.render("home", { offer, user: null, userinfo: {}, locationType, region, county, discountType });
    }
  });
});


//login route
app.post("/dashboard", (request, response) => {
  let username = request.body.username_field;
  let userpassword = request.body.password_field;

  if (username && userpassword) {
    let checkuser = `SELECT * FROM member WHERE username = ?`;

    connection.query(checkuser, [username], async (err, rows) => {
      if (err) throw err;

      let numrows = rows.length;

      if (numrows == 0) {
        response.send("Incorrect username");
        response.end();
      } else {

        let hashedPassword = rows[0].password; 

        console.log('DB Hash:', hashedPassword);
        console.log('Hashed Input:', await bcrypt.hash(userpassword, 10)); 


        try {

          if (await bcrypt.compare(userpassword, hashedPassword)) {
            let sessionObj = request.session;
            sessionObj.authen = rows[0].member_id;
            return response.redirect("/dashboard");

          } else {
            response.send("Incorrect password");
            response.end();
          }

    } catch(err) {
      console.error(err);
      response.send("An error occurred");
      response.end();
    };
    };
    });
  } else {
    response.send("Please enter username and password");
    response.end();
  }
});


app.get("/dashboard", (request, response) => {
  let sessionObj = request.session;
  if (sessionObj.authen) {
    let userid = sessionObj.authen;
    let savedID = request.query.saved_id;


    let userdetails = `SELECT member_id, username, password, email, first_name, last_name, county,
                        country, date_joined FROM member WHERE member_id = ?;
                        
                        SELECT saved_id, saved.offer_id, saved.member_id, 
                        member.username, offer.offer_name, offer.offer_image 
                        FROM saved INNER JOIN offer ON offer.offer_id = saved.offer_id 
                        INNER JOIN member ON member.member_id = saved.member_id 
                        WHERE saved.member_id = ?;

                        SELECT saved_id, saved.offer_id, saved.member_id, 
                        member.username, offer.offer_name, offer.offer_image 
                        FROM saved INNER JOIN offer ON offer.offer_id = saved.offer_id 
                        INNER JOIN member ON member.member_id = saved.member_id 
                        WHERE saved.saved_id = ?;
                        
                        SELECT offer_id, offer.member_id, offer_name, offer_image, offer_desc, offer_code, 
                        offer_url, start_date, expiry_date, date_submitted, merchant.merchant_name, 
                        category.category FROM offer INNER JOIN merchant ON offer.merchant_id = merchant.merchant_id
                        INNER JOIN category ON category.category_id = offer.category_id
                        WHERE member_id = ?;
                        
                        SELECT offer_like_id, offer_likes.offer_id, offer_likes.member_id, 
                        offer.offer_name, offer.offer_image FROM offer_likes 
                        INNER JOIN offer ON offer.offer_id = offer_likes.offer_id 
                        INNER JOIN member ON member.member_id = offer_likes.member_id 
                        WHERE offer_likes.member_id = ?`;

    connection.query(userdetails, [userid, userid, savedID, userid, userid], (err, row) => {
      if (err) throw err;

      let userrow = row[0][0];
      let savedrow = row[1];
      let savedID = row[2];
      let memberSubmittedOffer = row[3];
      let memberLike = row[4];

      console.log(userrow);
      console.log(savedrow);
      console.log(memberSubmittedOffer);

      response.render("dashboard", {
        userdata: userrow,
        saveddata: savedrow,
        savedID: savedID,
        memberSubmittedOffer : memberSubmittedOffer,
        memberLike : memberLike
      });
    });
  } else {
    response.send(`<br><p> <a href='/home'> Log in </a> to view your dashboard 
                or  <a href='/registration'> Register </a> as a member</p></br>`);
  }
});

app.get("/edit", (request, response) => {
  let sessionObj = request.session;

  if (sessionObj.authen) {
    let id = request.query.eid;

    let memberInfo = `SELECT member_id, username, password, email, first_name, last_name, county,
  country, date_joined FROM member WHERE member_id = ?`;

    connection.query(memberInfo, [id], (err, row) => {
      response.render("edit", { row : row });
    });
  }
});

app.get("/editOffer", (request, response) => {
  let sessionObj = request.session;

  if (sessionObj.authen) {
    let id = request.query.eid;

    let memberOffer = `SELECT offer_id, offer.member_id, member.username offer_name, 
                      offer_image, offer_desc, offer_code, offer_url, start_date, 
                      expiry_date, date_submitted, merchant.merchant_name, category.category 
                      FROM offer 
                      INNER JOIN merchant ON offer.merchant_id = merchant.merchant_id
                      INNER JOIN category ON category.category_id = offer.category_id
                      INNER JOIN member ON member.member_id = offer.member_id
                      WHERE offer_id = ?`;

    connection.query(memberOffer, [id], (err, row) => {
      response.render("editOffer", { row });
    });
  }
});


app.post("/editOfferName", (request, response) => {
  let changeid = request.body.id_field;
  let offerName = request.body.offer_name_field;
  let updatesql = `UPDATE offer SET offer_name = ? WHERE offer_id = ?`;

  connection.query(updatesql, [offerName, changeid], (err, result) => {
    if (err) throw err;
    if (result) {
      console.table(result);
      response.send(`<br><p> Updated! Go back to <a href='/dashboard'> dashboard </a></p></br>`);
    }
  });
});

app.post("/editOfferDesc", (request, response) => {
  let changeid = request.body.id_field;
  let offerDesc = request.body.offer_desc_field;
  let updatesql = `UPDATE offer SET offer_desc = ? WHERE offer_id = ?`;

  connection.query(updatesql, [offerDesc, changeid], (err, result) => {
    if (err) throw err;
    if (result) {
      console.table(result);
      response.send(`<p>Updated<p>`);
    }
  });
});

app.post("/editOfferImage", (request, response) => {
  let changeid = request.body.id_field;
  let offerImage = request.body.offer_image_field;
  let updatesql = `UPDATE offer SET offer_image = ? WHERE offer_id = ?`;

  connection.query(updatesql, [offerImage, changeid], (err, result) => {
    if (err) throw err;
    if (result) {
      console.table(result);
      response.send(`<p>Updated<p>`);
    }
  });
});

app.post("/editOfferCode", (request, response) => {
  let changeid = request.body.id_field;
  let offerCode = request.body.offer_code_field;
  let updatesql = `UPDATE offer SET offer_code = ? WHERE offer_id = ?`;

  connection.query(updatesql, [offerCode, changeid], (err, result) => {
    if (err) throw err;
    if (result) {
      console.table(result);
      response.send(`<p>Updated<p>`);
    }
  });
});

app.post("/editOfferURL", (request, response) => {
  let changeid = request.body.id_field;
  let offerURL = request.body.offer_URL_field;
  let updatesql = `UPDATE offer SET offer_url = ? WHERE offer_id = ?`;

  connection.query(updatesql, [offerURL, changeid], (err, result) => {
    if (err) throw err;
    if (result) {
      console.table(result);
      response.send(`<p>Updated<p>`);
    }
  });
});

app.post("/editUsername", (request, response) => {
  let changeid = request.body.id_field;
  let username = request.body.user_field;
  let updatesql = `UPDATE member SET username = ? WHERE member_id = ?`;

  connection.query(updatesql, [username, changeid], (err, result) => {
    if (err) throw err;
    if (result) {
      console.table(result);
      response.send(`<p>Updated<p>`);
    }
  });
});

app.post("/editFirstName", (request, response) => {
  let changeid = request.body.id_field;
  let firstname = request.body.first_name_field;
  let updatesql = `UPDATE member SET first_name = ? WHERE member_id = ?`;

  connection.query(updatesql, [firstname, changeid], (err, result) => {
    if (err) throw err;
    if (result) {
      console.table(result);
      response.send(`<p>Updated<p>`);
    }
  });
});

app.post("/editLastName", (request, response) => {
  let changeid = request.body.id_field;
  let lastname = request.body.last_name_field;
  let updatesql = `UPDATE member SET last_name = ? WHERE member_id = ?`;

  connection.query(updatesql, [lastname, changeid], (err, result) => {
    if (err) throw err;
    if (result) {
      console.table(result);
      response.send(`<p>Updated<p>`);
    }
  });
});

app.post("/editEmail", (request, response) => {
  let changeid = request.body.id_field;
  let email = request.body.email_field;
  let updatesql = `UPDATE member SET email = ? WHERE member_id = ?`;

  connection.query(updatesql, [email, changeid], (err, result) => {
    if (err) throw err;
    if (result) {
      console.table(result);
      response.send(`<p>Updated<p>`);
    }
  });
});

app.post("/editCounty", (request, response) => {
  let changeid = request.body.id_field;
  let county = request.body.county_field;
  let updatesql = `UPDATE member SET county = ? WHERE member_id = ?`;

  connection.query(updatesql, [county, changeid], (err, result) => {
    if (err) throw err;
    if (result) {
      console.table(result);
      response.send(`<p>Updated<p>`);
    }
  });
});

app.post("/editCountry", (request, response) => {
  let changeid = request.body.id_field;
  let country = request.body.country_field;
  let updatesql = `UPDATE member SET country = ? WHERE member_id = ?`;

  connection.query(updatesql, [country, changeid], (err, result) => {
    if (err) throw err;
    if (result) {
      console.table(result);
      response.send(`<p>Updated<p>`);
    }
  });
});

app.get("/registration", (request, response) => {
  response.render("registration");
});

//log out route to end session
app.get("/logout", (request, response) => {
  request.session.destroy();
  response.redirect("/home");
});

app.post("/registration", async (request, resend) => {
 
  try {
 
  const saltRound = 10;

  let username = request.body.username;
  let password = request.body.password;
  let emailaddress = request.body.email_address;
  let firstname = request.body.first_name;
  let lastname = request.body.last_name;
  let county = request.body.county;
  let country = request.body.country;
  let datejoined = new Date()
    .toLocaleString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .split("/")
    .reverse()
    .join("-");

  const hashedpassword = await bcrypt.hash(request.body.password, saltRound);

  let sqlSearch = `SELECT * FROM member WHERE username = ?`;

  connection.query(sqlSearch, [username], (err, row) => {
    if (err) throw err;

    if(row.length > 0  ) {

      response.send("Please choose another username! This one is taken");


    } else {

      let newuserinfo = `INSERT INTO member (member_id, username, password, email, 
        first_name, last_name, county, country, date_joined) 
        VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?)`;

        connection.query(
          newuserinfo,
          [
            username,
            hashedpassword,
            emailaddress,
            firstname,
            lastname,
            county,
            country,
            datejoined,
          ],
          (err, rows) => {
            if (err) throw err;
            // resend.redirect("/landing");
            resend.send("You have been added");
      
    });

  };

});

  } catch (err){
    response.send('Error!')
  
  };
});



//view all vouchers
app.get("/vouchers", (request, response) => {
  let allvoucher = ` SELECT category, offer.category_id, county.county, offer.county_id, 
  date_submitted, offer.discount_type_id, discount_type, expiry_date, 
  offer.location_type_id, location_type, member.username, offer.member_id, offer_code, 
  offer.merchant_id, merchant.merchant_name, offer_code, offer_desc, offer_id, 
  offer_image, offer_name, offer.offer_type_id, offer_url, offer.region_id, region 
  FROM offer 
  LEFT JOIN category ON offer.category_id = category.category_id
  LEFT JOIN county ON offer.county_id = county.county_id
  LEFT JOIN discount_type ON offer.discount_type_id = discount_type.discount_type_id
  LEFT JOIN location_type ON offer.location_type_id = location_type.location_type_id
  LEFT JOIN member ON offer.member_id = member.member_id
  LEFT JOIN merchant ON offer.merchant_id = merchant.merchant_id
  LEFT JOIN offer_type ON offer.offer_type_id = offer_type.offer_type_id
  LEFT JOIN region ON offer.region_id = region.region_id
  WHERE offer.offer_type_id = 2`;

  connection.query(allvoucher, (err, voucherinfo) => {
    if (err) throw err;

    response.render("vouchers", { voucherinfo: voucherinfo });
  });
});

//view all deals
app.get("/deals", (request, response) => {
  let alldeal = ` SELECT category, offer.category_id, county.county, offer.county_id, 
  date_submitted, offer.discount_type_id, discount_type, expiry_date, 
  offer.location_type_id, location_type, member.username, offer.member_id, 
  offer.merchant_id, merchant.merchant_name, offer_code, offer_desc, offer_id, 
  offer_image, offer_name, offer.offer_type_id, offer_url, offer.region_id, region 
  FROM offer 
  LEFT JOIN category ON offer.category_id = category.category_id
  LEFT JOIN county ON offer.county_id = county.county_id
  LEFT JOIN discount_type ON offer.discount_type_id = discount_type.discount_type_id
  LEFT JOIN location_type ON offer.location_type_id = location_type.location_type_id
  LEFT JOIN member ON offer.member_id = member.member_id
  LEFT JOIN merchant ON offer.merchant_id = merchant.merchant_id
  LEFT JOIN offer_type ON offer.offer_type_id = offer_type.offer_type_id
  LEFT JOIN region ON offer.region_id = region.region_id
  WHERE offer.offer_type_id = 1`;

  connection.query(alldeal, (err, dealinfo) => {
    if (err) throw err;

    response.render("deals", { dealinfo: dealinfo });
  });
});

app.get("/merchant", (request, response) => {
  let allMerchant = `SELECT merchant_id, merchant_name, merchant_info, merchant_image, merchant_url 
                  FROM merchant`;

  connection.query(allMerchant, (err, merchantInfo) => {
    if (err) throw err;

    response.render("merchant", { merchantInfo: merchantInfo });
  });
});


app.get("/category", (request, response) => {
  let allCategory = `SELECT * FROM category`;

  connection.query(allCategory, (err, categoryInfo) => {
    if (err) throw err;

    response.render("category", { categoryInfo: categoryInfo });
  });
});


//view offers in each category
app.get("/eachCategory", (request, response) => {
  let sessionObj = request.session;
  let member_id = sessionObj.authen;
  let category_id = request.query.bid;
  
  let getCategory = `SELECT offer_name, offer_id, offer_desc, offer_image, date_submitted, 
                    category, merchant.merchant_id FROM offer 
                    INNER JOIN category ON offer.category_id = category.category_id 
                    INNER JOIN merchant ON merchant.merchant_id = offer.merchant_id 
                    WHERE offer.category_id = ? ORDER BY date_submitted DESC`;

  let getMember = `SELECT member.member_id, username FROM member 
                    WHERE member.member_id = ?`;
                  
 connection.query(getCategory, [category_id], (err, categoryRow) => {
   if (err) throw err;
                  
  console.log("category", categoryRow);
                  
  if(member_id) {
                  
  connection.query(getMember, [member_id], (err, member) => {
                  
    if (err) throw err;
    console.log("member ", member);
                  
    response.render("eachCategory", { categoryRow : categoryRow, member: member });
     });
   } else {
                  
     response.render("eachCategory", {categoryRow : categoryRow, member: [] });
     }
                      
  });
});
                  




//view an individual voucher
app.get("/eachVoucher", (request, response) => {
  let sessionObj = request.session;
  let member_id = sessionObj.authen;
  let voucherid = request.query.bid;

  let getvoucher = `SELECT category, offer.category_id, county.county, offer.county_id, 
  date_submitted, offer.discount_type_id, discount_type, expiry_date, 
  offer.location_type_id, location_type, member.username, offer.member_id, 
  offer.merchant_id, merchant.merchant_name, offer_code, offer_desc, offer_id, 
  offer_image, offer_name, offer_url, offer.region_id, region 
  FROM offer 
  LEFT JOIN category ON offer.category_id = category.category_id
  LEFT JOIN county ON offer.county_id = county.county_id
  LEFT JOIN discount_type ON offer.discount_type_id = discount_type.discount_type_id
  LEFT JOIN location_type ON offer.location_type_id = location_type.location_type_id
  LEFT JOIN member ON offer.member_id = member.member_id
  LEFT JOIN merchant ON offer.merchant_id = merchant.merchant_id
  LEFT JOIN region ON offer.region_id = region.region_id
  WHERE offer_id = ?`;

  let getMember = `SELECT member.member_id, username FROM member 
  WHERE member.member_id = ?`;

  connection.query(getvoucher, [voucherid], (err, voucherrow) => {
    if (err) throw err;

    

    console.log("voucher", voucherrow);

    if(member_id) {

      connection.query(getMember, [member_id], (err, member) => {

        if (err) throw err;
        console.log("member ", member);

    response.render("eachVoucher", { voucherrow : voucherrow, member: member });
      });
    } else {

      response.render("eachVoucher", {voucherrow : voucherrow, member: [] });
    }
    
  });
});

//view an individual deal
app.get("/eachDeal", (request, response) => {
  let sessionObj = request.session;
  let member_id = sessionObj.authen;
  let dealid = request.query.bid;

  let getrow = `SELECT category, offer.category_id, county.county, offer.county_id, 
  date_submitted, offer.discount_type_id, discount_type, expiry_date, 
  offer.location_type_id, location_type, member.username, offer.member_id, 
  offer.merchant_id, merchant.merchant_name, offer_code, offer_desc, offer_id, 
  offer_image, offer_name, offer_url, offer.region_id, region 
  FROM offer 
  LEFT JOIN category ON offer.category_id = category.category_id
  LEFT JOIN county ON offer.county_id = county.county_id
  LEFT JOIN discount_type ON offer.discount_type_id = discount_type.discount_type_id
  LEFT JOIN location_type ON offer.location_type_id = location_type.location_type_id
  LEFT JOIN member ON offer.member_id = member.member_id
  LEFT JOIN merchant ON offer.merchant_id = merchant.merchant_id
  LEFT JOIN region ON offer.region_id = region.region_id
  WHERE offer_id = ?`;

  let memberQuery = `SELECT member.member_id, username FROM member
  WHERE member.member_id = ?`;

  connection.query(getrow, [dealid], (err, dealrow) => {
    if (err) throw err;

    console.log("deal", dealrow);

    if (member_id) {

      connection.query(memberQuery, [member_id], (err, member) => {
        if (err) throw err;

        console.log("member ", member);

        response.render("eachDeal", {dealrow : dealrow, member: member });


     });
  
  } else {
    
      response.render("eachDeal", { dealrow : dealrow, member: [] });
    
  };
    });
  
});

app.get("/submitDeal", (request, response) => {
  let sessionObj = request.session;

  if (sessionObj.authen) {
    let member_id = sessionObj.authen;

    let getDeal = `SELECT member_id, username FROM member WHERE member_id = ?;
                  SELECT merchant_id, merchant_name FROM merchant;
                  SELECT discount_type_id, discount_type FROM discount_type;
                  SELECT category_id, category FROM category;
                  SELECT location_type_id, location_type FROM location_type;
                  SELECT region_id, region FROM region;
                  SELECT county_id, county FROM county;
                  `;

    connection.query(getDeal, [member_id], (err, dealResults) => {
      if (err) throw err;

      console.log("deal results : ", dealResults);

      let member = dealResults[0][0];
      let merchant = dealResults[1];
      let discountType = dealResults[2];
      let category = dealResults[3];
      let locationType = dealResults[4];
      let region = dealResults[5];
      let county = dealResults[6];

      response.render("submission", {
        member: member,
        merchantlist: merchant,
        dtypelist: discountType,
        catlist: category,
        ltypelist: locationType,
        reglist: region,
        coulist: county,
      });
    });
  } else {
    response.send(`<br><p> <a href='/home'> Log in </a> to submit a Deal
               or  <a href='/registration'> Register </a> as a member</p></br>`);
  }
});

//post new
app.post("/submitDeal", (request, response) => {
  let sessionObj = request.session;
  let member_id = sessionObj.authen;

  let offer_name = request.body.deal;
  let offer_desc = request.body.desc;
  let offer_image = request.body.img;
  let offer_code = request.body.code || null;
  let offer_url = request.body.url;
  let start_date = request.body.start || null;
  let expiry_date = request.body.expire || null;
  let merchant_id = request.body.merchant;
  let discount_type_id = request.body.discount_type || null;
  let category_id = request.body.category;
  let location_type_id = request.body.location_type;
  let region_id = request.body.region || null;
  let county_id = request.body.county || null;
  let dateSubmitted = new Date()
    .toLocaleString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .split("/")
    .reverse()
    .join("-");

  let newDeal = `INSERT INTO offer (offer_id, offer_name, offer_desc, offer_image,
                  offer_code, offer_url, start_date, expiry_date, date_submitted,
                  merchant_id, offer_type_id, discount_type_id, category_id,
                  location_type_id, region_id, county_id, member_id) 
                  VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, '1', ?, ?, ?, ?, ?, '${member_id}');
                  SELECT * FROM merchant WHERE merchant_id = ?;
                  SELECT * FROM discount_type WHERE discount_type_id = ?;
                  SELECT * FROM category WHERE category_id = ?;
                  SELECT * FROM location_type WHERE location_type_id = ?;
                  SELECT * FROM region WHERE region_id = ?;
                  SELECT * FROM county WHERE county_id = ?;`;

  connection.query(
    newDeal,
    [
      offer_name,
      offer_desc,
      offer_image,
      offer_code,
      offer_url,
      start_date,
      expiry_date,
      dateSubmitted,
      merchant_id,
      
      discount_type_id,
      category_id,
      location_type_id,
      region_id,
      county_id,
      member_id,
      discount_type_id,
      category_id,
      location_type_id,
      region_id,
      county_id,
    ],
    (err, dealobject) => {
      if (err) throw err;

      //console.log(dealobject);

      // let selectMerchant = dealobject[1][0].merchant;
      // let selectDiscountType = dealobject[2][0].discountType;
      // let selectCategory = dealobject[3][0].category;
      // let selectLocationType = dealobject[4][0].locationType;
      // let selectRegion = dealobject[5][0].region;
      // let selectCounty = dealobject[6][0].county;

      response.send("Deal has been submitted");
    }
  );
});

app.get("/submitVoucher", (request, response) => {
  let sessionObj = request.session;

  if (sessionObj.authen) {
    let member_id = sessionObj.authen;

    let getDeal = `SELECT member_id, username FROM member WHERE member_id = ?;
                  SELECT merchant_id, merchant_name FROM merchant;
                  SELECT discount_type_id, discount_type FROM discount_type;
                  SELECT category_id, category FROM category;
                  SELECT location_type_id, location_type FROM location_type;
                  SELECT region_id, region FROM region;
                  SELECT county_id, county FROM county;
                  `;

    connection.query(getDeal, [member_id], (err, dealResults) => {
      if (err) throw err;

      console.log("deal results : ", dealResults);

      let member = dealResults[0][0];
      let merchant = dealResults[1];
      let discountType = dealResults[2];
      let category = dealResults[3];
      let locationType = dealResults[4];
      let region = dealResults[5];
      let county = dealResults[6];

      response.render("submissionVoucher", {
        member: member,
        merchantlist: merchant,
        dtypelist: discountType,
        catlist: category,
        ltypelist: locationType,
        reglist: region,
        coulist: county,
      });
    });
  } else {
    response.send(`<br><p> <a href='/home'> Log in </a> to submit a Deal
               or  <a href='/registration'> Register </a> as a member</p></br>`);
  }
});

app.post("/submitVoucher", (request, response) => {
  let sessionObj = request.session;
  let member_id = sessionObj.authen;

  let offer_name = request.body.deal;
  let offer_desc = request.body.desc;
  let offer_image = request.body.img;
  let offer_code = request.body.code || null;
  let offer_url = request.body.url;
  let start_date = request.body.start || null;
  let expiry_date = request.body.expire || null;
  let merchant_id = request.body.merchant;
  let offer_type_id = request.body.offer_type;
  let discount_type_id = request.body.discount_type || null;
  let category_id = request.body.category;
  let location_type_id = request.body.location_type;
  let region_id = request.body.region || null;
  let county_id = request.body.county || null;
  let dateSubmitted = new Date()
    .toLocaleString("en-GB", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .split("/")
    .reverse()
    .join("-");

  let newDeal = `INSERT INTO offer (offer_id, offer_name, offer_desc, offer_image,
                  offer_code, offer_url, start_date, expiry_date, date_submitted,
                  merchant_id, offer_type_id, discount_type_id, category_id,
                  location_type_id, region_id, county_id, member_id) 
                  VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2', ?, ?, ?, ?, ?, '${member_id}');
                  SELECT * FROM merchant WHERE merchant_id = ?;
                  SELECT * FROM discount_type WHERE discount_type_id = ?;
                  SELECT * FROM category WHERE category_id = ?;
                  SELECT * FROM location_type WHERE location_type_id = ?;
                  SELECT * FROM region WHERE region_id = ?;
                  SELECT * FROM county WHERE county_id = ?;`;

  connection.query(
    newDeal,
    [
      offer_name,
      offer_desc,
      offer_image,
      offer_code,
      offer_url,
      start_date,
      expiry_date,
      dateSubmitted,
      merchant_id,
      offer_type_id,
      discount_type_id,
      category_id,
      location_type_id,
      region_id,
      county_id,
      member_id,
      discount_type_id,
      category_id,
      location_type_id,
      region_id,
      county_id,
    ],
    (err, dealobject) => {
      if (err) throw err;

      response.send("Voucher has been submitted");
    }
  );
});

//save an offer
app.post("/savedOffer", (request, response) => {
  let sessionObj = request.session;
  let member_id = sessionObj.authen;
  let offer_id = request.body.offer_id;
  // let offer_type_id = request.body.offer_type_id;
  //let offer_name = request.body.offer_name;

  let saveOffer = `INSERT INTO saved (offer_id,  member_id) 
                VALUES (?, ?);`;

  connection.query(saveOffer, [offer_id, member_id], (err, row) => {
    if (err) throw err;
    response.redirect("dashboard");
  });
});

//view a saved offer in dashboard
app.get("/viewOffer", (request, response) => {
  let sessionObj = request.session;

  if (sessionObj.authen) {
    let id = request.query.eid;

    let offerInfo = `SELECT category, offer.category_id, county.county, offer.county_id, 
  date_submitted, offer.discount_type_id, discount_type, expiry_date, 
  offer.location_type_id, location_type, member.username, offer.member_id, offer_code, 
  offer.merchant_id, merchant.merchant_name, offer_desc, offer.offer_id, 
  offer_image, offer_name, offer.offer_type_id, offer_url, offer.region_id, 
  region, saved.saved_id, saved.offer_id, saved.member_id
  FROM offer 
  LEFT JOIN category ON offer.category_id = category.category_id
  LEFT JOIN county ON offer.county_id = county.county_id
  LEFT JOIN discount_type ON offer.discount_type_id = discount_type.discount_type_id
  LEFT JOIN location_type ON offer.location_type_id = location_type.location_type_id
  LEFT JOIN member ON offer.member_id = member.member_id
  LEFT JOIN merchant ON offer.merchant_id = merchant.merchant_id
  LEFT JOIN offer_type ON offer.offer_type_id = offer_type.offer_type_id
  LEFT JOIN region ON offer.region_id = region.region_id
  INNER JOIN saved ON saved.offer_id = offer.offer_id
  WHERE saved.saved_id = ? `;

    connection.query(offerInfo, [id], (err, row) => {
      response.render("savedOffer", { row : row });
    });
  }
});

//view a posted offer in dashboard
app.get("/viewPostedOffer", (request, response) => {
  let sessionObj = request.session;

  if (sessionObj.authen) {
    let id = request.query.eid;

  let offerPosted = `SELECT category, offer.category_id, county.county, offer.county_id, 
  date_submitted, offer.discount_type_id, discount_type, expiry_date, 
  offer.location_type_id, location_type, member.username, offer.member_id, offer_code, 
  offer.merchant_id, merchant.merchant_name, offer_desc, offer.offer_id, 
  offer_image, offer_name, offer.offer_type_id, offer_url, offer.region_id, 
  region
  FROM offer 
  LEFT JOIN category ON offer.category_id = category.category_id
  LEFT JOIN county ON offer.county_id = county.county_id
  LEFT JOIN discount_type ON offer.discount_type_id = discount_type.discount_type_id
  LEFT JOIN location_type ON offer.location_type_id = location_type.location_type_id
  INNER JOIN member ON offer.member_id = member.member_id
  LEFT JOIN merchant ON offer.merchant_id = merchant.merchant_id
  LEFT JOIN offer_type ON offer.offer_type_id = offer_type.offer_type_id
  LEFT JOIN region ON offer.region_id = region.region_id 
  WHERE offer.offer_id = ? `;

    connection.query(offerPosted, [id], (err, postedrow) => {

      console.log("Row fetched from the database:", postedrow);

      response.render("postedOffer", { postedrow : postedrow });
    });
  }
});

// app.get("/deleteSavedOffer", (request, response) => {

//   let id = request.body.saved_id;
//   let sessionObj = request.session;

//   if(sessionObj.authen) {
//     let offerResult = `SELECT * FROM saved
//                         INNER JOIN offer ON saved.offer_id = offer.offer_id
//                         INNER JOIN member ON saved.member_id = member.member_id
//                         INNER JOIN offer_type ON saved.offer_type_id = offer_type.offer_type_id
//                         WHERE saved.saved_id = ?`;

//     connection.query(offerResult, [id], (err, savedrow) => {
//     if (err) throw err;
//     console.log(row);
//     response.render('savedOffer', {savedrow} );
//     });
//   };
//   });

app.post("/deleteSavedOffer", (request, response) => {
  let memberid = request.body.memberid;
  let savedid = request.body.savedid;
  //let savedid = request.query.eid;
  let sessionObj = request.session;

  if (sessionObj.authen) {
    let sqlinsert = `DELETE FROM saved WHERE saved.saved_id = ? `;

    connection.query(sqlinsert, [savedid], (err, row) => {
      if (err) {
        console.error(err);
        response.status(500).send("Error deleting offer");
        return;
      }

      console.log("saved : ", savedid);
      console.log("member : ", memberid);

      response.send(`<br><p> That has been updated! Go back to <a href='/dashboard'> Dashboard! </a></p></br>`);
    });
  }
});

//view a liked offer in dashboard
app.get("/viewLikedOffer", (request, response) => {
  let sessionObj = request.session;

  if (sessionObj.authen) {
    let id = request.query.eid;

  let likedOffer = `SELECT category, offer.category_id, county.county, offer.county_id, 
  date_submitted, offer.discount_type_id, discount_type, expiry_date, 
  offer.location_type_id, location_type, member.username, offer.member_id, offer_code, 
  offer.merchant_id, merchant.merchant_name, offer_desc, offer.offer_id, 
  offer_image, offer_name, offer.offer_type_id, offer_url, offer.region_id, 
  region
  FROM offer 
  LEFT JOIN category ON offer.category_id = category.category_id
  LEFT JOIN county ON offer.county_id = county.county_id
  LEFT JOIN discount_type ON offer.discount_type_id = discount_type.discount_type_id
  LEFT JOIN location_type ON offer.location_type_id = location_type.location_type_id
  INNER JOIN member ON offer.member_id = member.member_id
  LEFT JOIN merchant ON offer.merchant_id = merchant.merchant_id
  LEFT JOIN offer_type ON offer.offer_type_id = offer_type.offer_type_id
  LEFT JOIN region ON offer.region_id = region.region_id 
  WHERE offer.offer_id = ? `;

    connection.query(likedOffer, [id], (err, likedrow) => {

      console.log("Row fetched from the database:", likedrow);

      response.render("likedOffer", { likedrow : likedrow });
    });
  }
});


app.post("/submitVoucherLike", (request, response) => {
  let voucherID = request.body.offer_id;
  let sessionObj = request.session;

  if (sessionObj.authen) {
    let userID = sessionObj.authen;

    let checkLiked = `SELECT offer_like_id FROM offer_likes WHERE offer_id = ? AND member_id = ?`;

    connection.query(checkLiked, [voucherID, userID], (err, result) => {
      if (err) throw err;

      if (result.length > 0) {
        return response("You have already liked this offer");
      }

      let insertLike = `INSERT INTO offer_likes (offer_id, member_id) VALUES (?, ?)`;

      connection.query(insertLike, [voucherID, userID], (err, row) => {
        if (err) throw err;

        let likeCount = `UPDATE offer SET like = like + 1 WHERE offer_id = ?`;

        connection.query(likeCount, [voucherID], (err, row) => {
          if (err) throw err;

          response.send("Like added successfully");
        });
      });
    });
  } else {
    response.send(`<br><p> <a href='/home'> Log in </a> to like a Voucher
    or  <a href='/registration'> Register </a> as a member</p></br>`);
  }
});

app.post("/submitDealLike", (request, response) => {
  let offerID = request.body.offer_id;
  let sessionObj = request.session;

  if (sessionObj.authen) {
    let userID = sessionObj.authen;

    let checkLiked = `SELECT offer_like_id FROM offer_likes WHERE offer_id = ? AND member_id = ?`;

    connection.query(checkLiked, [offerID, userID], (err, result) => {
      if (err) throw err;

      if (result.length > 0) {
        return response.send("You have already liked this offer");
      }

      let insertLike = `INSERT INTO offer_likes (offer_id, member_id) VALUES (?, ?)`;

      connection.query(insertLike, [offerID, userID], (err, row) => {
        if (err) throw err;

        let likeCount = `UPDATE offer SET likes = likes + 1 WHERE offer_id = ?`;

        connection.query(likeCount, [offerID], (err, row) => {
          if (err) throw err;

          response.send("Like added successfully");
        });
      });
    });
  } else {
    response.send(`<br><p> <a href='/home'> Log in </a> to like a Voucher
    or  <a href='/registration'> Register </a> as a member</p></br>`);
  }
});


//start the web server on port 3000
app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
