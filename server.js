var express = require('express');
var mongo = require('mongodb').MongoClient;
var session = require('express-session');
var ejs = require('ejs');
var bodyParser = require('body-parser');
var passport = require('passport');
var Strategy = require('passport-local').Strategy;
var md5 = require('md5');
var nodemailer = require('nodemailer');
var transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // secure:true for port 465, secure:false for port 587
    auth: {
        user: 'mailer.ssm.app@gmail.com',
        pass: process.env.MAILPW
    }
});

var mail_template = require('./views/welcome_mail');
var dburl = process.env.DBURL;
var port = process.env.PORT;
var app = express();

app.use(express.static(`${__dirname}/views`));
app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({ // to support URL-encoded bodies
    extended: true
}));
app.use(session({
    secret: "Shh, its a secret!"
}));
app.set('vew engine', 'ejs');

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function (user, done) {
    done(null, user);
});
passport.deserializeUser(function (user, done) {
    done(null, user);
});

////////
passport.use(new Strategy(
    function (username, password, done) {
        mongo.connect(dburl, function (err, db) {
            if (err) {
                console.log(err);
            } else {
                var col = db.collection('data');
                username = username.toLowerCase();
                col.find({
                    username: username
                }, {
                    _id: 0
                }).toArray(function (err, ress) {
                    if (err) {
                        console.log(err);
                    } else {
                        if (ress.length == 0) {
                            console.log('user not found!');
                            done(null, false);
                        } else {
                            if (md5(password) == ress[0].hash) {
                                console.log('Verified!');
                                return done(null, ress[0]);
                            } else {
                                console.log('Wrong password!');
                                done(null, false);
                            }
                        }
                    }
                });
            }
        });

    }));
////////




app.post('/signup', function (req, res) {
    console.log('\nSIGNUP ROUTE POST');
    var username = req.body.username.toLowerCase();
    var email = req.body.email;
    var hash = md5(req.body.password);
    console.log(`${username} : ${hash}`);
    //console.log(`HASH: ${hash}`);
    mongo.connect(dburl, function (err, db) {
        if (err) {
            console.log(err);
            res.json({
                alert: 'Cannot connect to db'
            });
        } else {
            var col = db.collection('data');
            col.find({
                username: username
            }).toArray(function (err, ress) {
                if (err) {
                    console.log(err);
                    res.json({
                        alert: 'db err'
                    });
                } else {
                    if (ress.length > 0) {
                        console.log('User exists');
                        res.json({
                            //                            alert: 'Username taken',
                            log: 'Username taken',
                            code: 101
                        });
                        //res.send('DONE');
                    } else {

                        col.find({
                            email: email
                        }).toArray(function (err, results) {
                            if (err) {
                                console.log(err);
                            } else {
                                if (results.length > 0) {
                                    console.log('email taken');
                                    res.json({

                                        code: 750
                                    });
                                } else {
                                    var user = {};
                                    user.username = username;
                                    user.hash = hash;
                                    user.email = email;
                                    user.key = `mailerkey${Date.now()}`;
                                    user.projects = [];
                                    col.insert(user);
                                    res.json({
                                        alert: 'Thank you. Log in with your credentials.',
                                        log: user.key,
                                        code: 100,
                                        redirect: '/'
                                    });
                                    console.log('DONE');

                                    ////Welcome Msg

                                    var html = mail_template.mail;

                                    let mailOptions = {
                                        from: 'mailer', // sender address
                                        to: email, // list of receivers
                                        subject: `Welcome to Mailer, ${username}!`, // Subject line
                                        text: 'Welcome to Mailer!', // plain text body
                                        html: html // html body
                                    };

                                    // send mail with defined transport object
                                    transporter.sendMail(mailOptions, (error, info) => {
                                        if (error) {
                                            return console.log(error);
                                        }
                                        console.log('Message %s sent: %s', info.messageId, info.response);
                                    });


                                    ///




                                }
                            }
                        });


                    }
                }
            });
        }
    });
});
app.post('/login',
    passport.authenticate('local', {
        failureRedirect: '/fail'
    }),
    function (req, res) {
        res.redirect('/success');
    });
app.get('/', function (req, res) {
    res.render('home.ejs', {});
});
app.post('/submit_project', function (req, res) {

    var project = req.body.project;
    var id = Date.now();

    if (!req.user) {
        res.json({
            alert: 'Please log in to submit projects...'
        });
    } else {
        mongo.connect(dburl, function (err, db) {
            if (err) {
                console.log(err);
                res.json({
                    alert: 'Error connecting to database'
                });
            } else {
                var col = db.collection('data');
                col.find({
                    username: req.user.username
                }, {
                    _id: 0
                }).toArray(function (err, ress) {
                    if (err) {
                        console.log(err);
                        res.json({
                            alert: 'Error connecting to database'
                        });
                    } else {
                        //Finding for existance
                        var exists = false;
                        ress[0].projects.forEach(function (item) {
                            if (item.name == project) {
                                exists = true;
                            }
                        });
                        if (exists) {
                            res.json({
                                code: 300
                            });
                            db.close();
                        } else {
                            var sub = {};
                            if (req.body.redirect) {
                                sub.redirect = req.body.redirect;
                            }
                            sub.name = project;
                            sub.id = id;
                            ress[0].projects.push(sub);
                            col.update({
                                username: req.user.username
                            }, ress[0]);
                            console.log('DB UPDATED!');
                            db.close();
                            res.json({
                                code: 400,
                                projects: ress[0].projects
                            });
                        }
                    }
                });
            }
        });
    }
});

app.post('/remove', function (req, res) {
    if (!req.user) {
        res.json({
            alert: 'Please log in first'
        });
    } else {
        var name = req.body.name;
        mongo.connect(dburl, function (err, db) {
            if (err) {
                console.log(err);
                res.json({
                    alert: 'Error connecting to database',
                    log: err
                });
            } else {
                var col = db.collection('data');
                col.find({
                    username: req.user.username
                }, {
                    _id: 0
                }).toArray(function (err, ress) {
                    if (err) {
                        console.log(err);
                        res.json({
                            alert: 'Error connecting to databse',
                            log: err
                        });
                    } else {
                        var index;
                        for (var i = 0; i < ress[0].projects.length; i++) {
                            if (ress[0].projects[i].name == name) {
                                index = i;
                            }
                        }
                        ress[0].projects.splice(index, 1);
                        col.update({
                            username: req.user.username
                        }, ress[0]);
                        res.json({
                            code: 500,
                            projects: ress[0].projects
                        });
                    }
                });
            }
        });
    }
});
app.get('/signup', function (req, res) {
    console.log('\nSIGNUP ROUTE GET');
    res.render('signup.ejs');
});

app.get('/login', function (req, res) {
    console.log('\nLOGIN ROUTE GET');
    res.render('login.ejs');
});
app.get('/logout', function (req, res) {
    req.logout();
    res.redirect('/');
});
app.get('/success', function (req, res) {
    if (req.user) {
        res.json({
            redirect: '/profile'
        });
    } else {
        res.json({
            alert: 'Logged in as GUEST',
            redirect: '/fail'

        });
    }
});
app.get('/fail', function (req, res) {
    res.json({
        alert: 'Login Failure. Please check username and password.'
    });
});

app.get('/profile', function (req, res) {
    if (req.user) {
        console.log(req.user);
        res.render('profile.ejs', req.user);
    } else {
        console.log('\nNOT LOGGED IN!');
        res.render('profile.ejs', {
            username: 'GUEST'
        });
        //        res.send('Authentication error! Please log in');
    }
});
app.get('/myProjects', function (req, res) {
    if (req.user) {
        mongo.connect(dburl, function (err, db) {
            if (err) {
                console.log(err);
                res.json({
                    alert: 'mongo err. See log',
                    log: err
                });
            } else {
                var col = db.collection('data');
                col.find({
                    username: req.user.username
                }, {
                    _id: 0
                }).toArray(function (err, ress) {
                    if (err) {
                        console.log(err);
                        res.json({
                            alert: 'Mongo err. see log',
                            log: err
                        });
                    } else {
                        res.json({
                            log: 'Success at obtainig user projects',
                            projects: ress[0].projects,
                            code: 200

                        });
                        db.close();
                    }
                });
            }
        });
    } else {
        res.json({
            alert: 'Not logged in'
        });
    }
});

app.post('/mailer', function (req, res) {
    console.log('\nMAILER ROUTE');
    var message = req.body;
    console.log(message);
    var id = req.query.id;
    mongo.connect(dburl, function (err, db) {
        if (err) {
            console.log(err);
        } else {
            var col = db.collection('data');
            var found = false;
            var email, username, project, redirect;
            col.find({}).toArray(function (err, ress) {
                if (err) {
                    console.log(err);
                } else {
                    ress.forEach(function (user) {
                        user.projects.forEach(function (item) {
                            if (!found) {
                                if (item.id == id) {
                                    found = true;
                                    email = user.email;
                                    username = user.username;
                                    project = item.name;
                                    if (item.redirect) {
                                        redirect = item.redirect;
                                    } else {
                                        redirect = '/default_redirect';
                                    }
                                }
                            }
                        });
                    });

                    if (found) {
                        var html = '<h2 style=\"text-align:center; margin-top:20px; margin-bottom:20px;\">Form data from ' + project + '</h2>';
                        for (var key in message) {
                            html += '<strong>' + key + ': </strong> ' + message[key] + '<br>';
                        }
                        html += '<br><div style=\"text-align:center; font-size:15px; margin-top:40px; margin-bottom:20px; padding-top:20px; border-top:1px solid grey;\">generated by <span style=\"color:blue; font-size:20px\">Mailer</span></div>';
                        console.log(html);




                        let mailOptions = {
                            from: 'mailer', // sender address
                            to: email, // list of receivers
                            subject: `Form submission from ${project}`, // Subject line
                            text: 'Data', // plain text body
                            html: html // html body
                        };
                        // send mail with defined transport object
                        transporter.sendMail(mailOptions, (error, info) => {
                            if (error) {
                                return console.log(error);
                            }
                            console.log('Message %s sent: %s', info.messageId, info.response);
                        });
                        res.redirect(redirect);
                    } else {
                        res.render('broken.ejs');
                    }

                }
            });
        }
    });
});

app.get('/default_redirect', function (req, res) {
    res.render('default_redirect.ejs');
});
app.get('/howto', function (req, res) {
    if (req.user) {
        res.render('howto.ejs', req.user);

    } else {
        res.render('howto.ejs', {
            username: 'GUEST'
        });

    }
});

app.listen(port, function () {
    console.log(`App started on port ${port}`);
});
