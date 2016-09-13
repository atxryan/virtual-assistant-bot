var restify = require('restify'),
    builder = require('botbuilder'),
    nconf   = require('nconf'),
    http = require('http'),
    request = require('request');

// Create nconf environment to load keys and connections strings
// which should not end up on GitHub
    nconf 
        .file({ file: './prod_config.json' })        // Included in repo
        .file({ file: './local_config.json' })  // Exists locally; not committed
        .env();                                 // environment vars

//=========================================================
// Bot Setup
//=========================================================

// Setup Restify Server
var server = restify.createServer();
server.listen( nconf.get("port"), function () {
   console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat bot
var connector = new builder.ChatConnector({
    appId: nconf.get("MICROSOFT_APP_ID"),
    appPassword: nconf.get("MICROSOFT_APP_PASSWORD")
});

var bot = new builder.UniversalBot(connector);

server.post('/api/messages', connector.listen());
server.get('/', restify.serveStatic({
    'directory' : '.',
    'default'   : 'static/index.html'
}));

//=========================================================
// Bots Dialogs
//=========================================================

// Create LUIS recognizer that points at our model
var model = nconf.get("LUIS_model_URL");
var recognizer = new builder.LuisRecognizer(model);
var intents = new builder.IntentDialog({ recognizers: [recognizer] });
var resultTopics;

bot.dialog('/', intents);

intents
    //.onBegin(builder.DialogAction.send("Hi, I'm your startup assistant!"))
    // Simple regex commands
    .matches(/^hello/i, function (session) {
        session.send("Hi there!");
    })
    .matches(/^help/i, function (session) {
        session.send("You asked for help.");
    })
    .matches(/^\/profile/i, function (session) {
        session.beginDialog('/profile');
    })
    //LUIS intent matches
    .matches('AzureCompliance', '/compliance')
    .matches('OfficeHours', '/officehours')
    .matches('SupportRequest', '/support')
    .matches('Documentation', '/documentation')
    .matches('BizSpark', '/bizspark')
    .matches('Introduction', '/introductions')
    .matches('Rude', '/rude')
    .onDefault('/didnotunderstand');

bot.dialog('/compliance', [
    function (session, args) {
        builder.Prompts.text(session, "You asked about Azure Compliance. Is that correct?");
    },
    confirmIntent
]);
bot.dialog('/officehours', [
    function (session, args) {
        builder.Prompts.text(session, "You asked about Office Hours. Is that correct?");
    },
    //confirmIntent,
    function (session, results, args) {
        if (results.response.toLowerCase() == 'y' || results.response.toLowerCase() == 'yes') {
            // Get subjects
            console.log("Getting subjects...");
            request.get({
                url: 'https://startupcalendarhelper.azurewebsites.net/api/OfficeHoursTopics?code=rrzp8pog8s4saixykuyslnrlvmo9f2jzl3x1'
            }, function(error, response, body){
                if(error) {
                    console.log(error);
                } else {
                    result = JSON.parse(body);
                    resultTopics = result;
                    console.log(response.statusCode, resultTopics);
                    builder.Prompts.choice(session, "What topic would you like to meet about?", resultTopics);
                }
            });
        } else {
            session.endDialog("Darn. Ok, I've logged this for review.");
        }
    }, function (session, results, next) {
        if(results.response && resultTopics.indexOf(results.response.entity) !== -1) {
            session.dialogData.officeHoursTopic = results.response.entity;
            builder.Prompts.choice(session, "When would you like to schedule your office hour?", ["Morning", "Afternoon"]);
        } else {
            session.send("Umm...huh?");
        }
    }, function (session, results, next) {
        if(results.response && ["Morning", "Afternoon"].indexOf(results.response.entity) !== -1) {
            session.dialogData.officeHoursTime = results.response.entity;
            var firstName = session.userData.name.split(" ")[0];
            var lastName = session.userData.name.split(" ")[1];

            console.log("Making meeting request...");

            var requestData = {
                "Topic": session.dialogData.officeHoursTopic,
                "ReqestorFirstName": firstName,
                "ReqestorLastName": lastName,
                "ReqestorEmailAddress": session.userData.email,
                "RequestedConversation": session.dialogData.officeHoursTopic,
                "RequestedDayHalf": session.dialogData.officeHoursTime,
                "IsTest": "false"
            };

            console.log(requestData);

            // Request meeting
            request.post({
                headers: {'content-type' : 'application/json'},
                url: 'https://startupcalendarhelper.azurewebsites.net/api/RequestTopicExpert?code=6yy62ob12opbsym3ombgkeudrq0dcws1fk04',
                json: true,
                body: requestData,
            }, function(error, response, body){
                if(error) {
                    console.log(error);
                } else {
                    session.endDialog("Thanks! You should receive an email to schedule your office hours.");
                    result = body;
                    console.log(response.statusCode, result);
                }
            });
        } else {
            session.send("Umm...huh?");
        }
    }
]);
bot.dialog('/support', [
    function (session, args) {
        builder.Prompts.text(session, "You made a Support Request. Is that correct?");
    },
    confirmIntent
]);
bot.dialog('/documentation', [
    function (session, args) {
        session.send("You asked about Documentation.");
        builder.Prompts.choice(session, "Which OS?", ["Windows", "Linux"]);
    },
    //confirmIntent,
    function (session, results) {
        // console.log("call to https://directline.botframework.com/api/conversations");

        // var options = {
        //     url: 'https://directline.botframework.com/api/conversations',
        //     headers: {
        //         'Authorization': 'BotConnector cV1SPT2QGuk.cwA.6aE.pI-bagzUkd5e6qMwaVRmUncdWmXxuqXQl5vmoRWpXrE'
        //     }
        // };
        // request.post(
        //     options, 
        //     function (error, response, body) {
        //         if (!error && response.statusCode == 200) {
        //             console.log(body)
        //         }
        //     }
        // );


        // Fake it!
        var baseUrl = 'https://azure.microsoft.com/en-us/documentation/services/virtual-machines/'
        session.send("Here's how to get started with %s virtual machines: " + baseUrl + "%s/", results.response.entity, results.response.entity);

        session.endDialog();
    }
]);
bot.dialog('/profile', [
    function (session, args) {
        session.send("I'd like to ask some questions to learn more about you and your startup.");
        builder.Prompts.text(session, "First, what's your name?");
    },
    function (session, results) {
        session.userData.name = results.response;
        builder.Prompts.text(session, "Hi " + results.response + ", What's the name of your startup?"); 
    },
    function (session, results) {
        session.userData.startup = results.response;
        builder.Prompts.text(session, "What is your email address?"); 
    },
    function (session, results) {
        session.userData.email = results.response;
        builder.Prompts.choice(session, "What's your primary coding language?", [".NET", "Node.js", "Ruby on Rails", "PHP", "Java"]);
    },
    function (session, results) {
        session.userData.languageChoice = results.response;
        builder.Prompts.choice(session, "What data store do you primarily use?", ["SQL Database", "Postgres", "MySQL", "Oracle", "MongoDB"]);
    },
    // TODO remove this later
    function (session, results) {
        session.userData.databaseChoice = results.response;
        builder.Prompts.text(session, "What do you like to do for fun?");
    },
    function(session, args) {
        builder.Prompts.confirm(session, "Really!?! Do you also like donuts? :-)");
    },
    function(session, args) {
        builder.Prompts.text(session, "Nice. I have someone who'd REALLY like to meet you.");
    },
    function (session, results) {
        session.send("Got it... " + session.userData.name + 
                     " your startup is " + session.userData.startup + 
                     " and you're currently using " + session.userData.languageChoice + ".");

        session.endDialog();
    }
]);
bot.dialog('/bizspark', [
    function (session, args) {
        builder.Prompts.text(session, "You asked about BizSpark. Is that correct?");
    },
    confirmIntent
]);
bot.dialog('/introductions', [
    function (session, args) {
        console.log("Wants an introduction!");

        session.send("I've logged this request and someone from the US Startups team will get back to you!");

        var requestData = {
                "Name": "Hooli",
                "ContactName": "Peter Parker",
                "ContactEmail": "peter@hooli.com",
                "Category": "Documentation",
                "Inquiry": "We would like to work with media services and video compression",
                "Location": "Silicon Valley"
                };

        request.post({
                headers: {'content-type' : 'application/json'},
                url: 'http://startupconnector.azurewebsites.net/api/cards/',
                json: true,
                body: requestData,
            }, 
            function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    console.log(body)
                }
            }
        );
        session.endDialog();
    }
]);
bot.dialog('/rude', function (session, args) {
    session.endDialog("Well, you're just being rude.");
});
bot.dialog('/didnotunderstand', [
    function (session, args) {
        console.log("[Utterance]", session.message.text);
        builder.Prompts.text(session, "I'm sorry. I didn't understand, but I'm learning. What was your intent here?")
    }, 
    function (session, results) {
        console.log("[Intent]", session.message.text);
        session.endDialog("Ok, I've logged this for review. Please ask another question.");
    }
]);

// Install First Run middleware and dialog
bot.use(builder.Middleware.firstRun({ version: 1.0, dialogId: '*:/firstRun' }));
bot.dialog('/firstRun', [
    function (session) {
        session.send("Hello... I'm the Microsoft Startup Bot.");
        
        if (!session.userData.name) {
            session.beginDialog('/profile');
        }
    },
    function (session) {
        session.endDialog("Ask me a  question and I'll try to help."); 
    }
]);

function confirmIntent (session, results) {
    console.log("confirmation attempt")
    if (results.response.toLowerCase() == 'y' || results.response.toLowerCase() == 'yes') {
        session.endDialog("Ok, I'm getting the hang of things.");
    } else {
        session.endDialog("Darn. Ok, I've logged this for review.");
    }          
}