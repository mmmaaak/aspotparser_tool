const path = require('path');
const fs = require('fs');

const request = require('request');
const cheerio = require('cheerio');

const BASE_URL = 'http://autospot.ru';
const BASE_DIR = 'data/';

function main() {
    parseBrands()
    .then(
        data => {
            return parseModels(data);
        }, err => {
            console.log('Error while parsing brands');
        })
    .then(
        data => {
            return true;
        }, err => {
            console.log(`Error while parsing prices: ${err}`);
        }
    );
}

// Parse Brands
function parseBrands() {
    return new Promise((resolve, reject) => {
        request(BASE_URL, (error, response, html) => {
            if(error !== null || response.statusCode !== 200) {
                console.error('Error while response page');
                reject();
            }
            let $ = cheerio.load(html);
            let brands = [];
            let modelsLinks = [];
            $('.model-carousel a').each(function() {
                let $this = $(this);
                let name = $this.text().trim();
                let alias = generateAlias(name);
                let brand = {
                    name: name,
                    image_url: getBackgroundFromStyle($this.find('span').attr('style')),
                    alias: alias,
                    models_url: path.join('/models', alias + '.json')
                };
                brands.push(brand);
                modelsLinks.push({ brand: alias, link: $this.attr('href')});
            });
            fs.writeFile(path.join(__dirname, BASE_DIR, 'brands.json'), JSON.stringify(brands),  (err) => {
                if(err !== null) {
                    console.error(err);
                    reject();
                }
                resolve(modelsLinks);
            });
        })
    })
}
// Parse Models
function parseModels(modelsLinks) {
    return new Promise((resolve, reject) => {
        let promises = modelsLinks.map(e => parseModel(e));
        Promise.all(promises).then( data => {
            resolve(data);
        }, err => {
            reject();
        });
    });
}

function parseModel(data) {
    return new Promise((resolve, reject) => {
        request(BASE_URL + data.link, (error, response, html) => {
            if(error !== null || response.statusCode !== 200) {
                console.log(`Error requesting models: ${BASE_URL + data.link}, error: ${error}`);
                reject();
            }
            let $ = cheerio.load(html);
            let models = [];
            let pricesLinks = [];
            $('.carlist li').each( function() {
                let $this = $(this);
                let name = $this.find('.car-title').text().trim();
                let alias = generateAlias(name);
                let model = {
                    name: name,
                    alias: alias,
                    offers: parseInt($this.find('.complete-set').text().trim()),
                    image_url: getBackgroundFromStyle($this.find('.car-photo').attr('style')),
                    prices_url: path.join('/prices', data.brand + '_' + alias + '.json')
                }
                models.push(model);
                pricesLinks.push({ model: data.brand + '_' + alias, link: $this.find('a').attr('href').trim() });
            });
            fs.writeFile(path.join(__dirname, BASE_DIR, 'models', data.brand + '.json'), JSON.stringify(models), (err) => {
                if(err) {
                    console.error(`Error while saving models: ${data.link}`);
                    reject();
                }
                let promises = pricesLinks.map( e => parsePrice(e));
                Promise.all(promises).then( data => {
                    resolve();
                });
            });
        });
    });
}

// Parse prices
function parsePrice(data) {
    return new Promise((resolve, reject) => {
        request(BASE_URL + data.link, (error, response, html) => {
            if(error !== null || response.statusCode !== 200) {
                console.log(`Error requesting price: ${BASE_URL + data.link}`);
                reject();
            }
            let $ = cheerio.load(html);
            let prices = {
                discount: [],
                price: []
            };
            $('.car__unit__wrapper .car__unit__block').each(function() {
                let $this = $(this);
                let name = $this.find('.car__unit__name .standart').text().trim();
                let alias = generateAlias(name);

                let settings = {};
                $this.find('.car__unit__sett .sett_unit').each(function() {
                    let $sett = $(this);
                    settings[generateAlias($sett.find('.sett_unit-left').text().trim())] = $sett.find('.sett_unit-right').text().trim();
                });
                let price = {};
                price.dealer = $this.find('.unit__price_price').text().trim();
                $this.find('.car__unit__price_setting').each(function() {
                    let $sett = $(this);
                    price[generateAlias($sett.find('.car__unit__price_setting-left').text().trim())] = $sett.find('.car__unit__price_setting-right').text().trim();
                });
                let discount = {
                    name: name,
                    alias: alias,
                    color: {
                        name: $this.find('.car__unit__name .metalic').text().trim(),
                        code: getColorFromStyle($this.find('.car__unit__name .metalic i').attr('style').trim())
                    },
                    settings: settings,
                    price: price,
                    image_url: getBackgroundFromStyle($this.find('.car__unit__img .car-card-photo').attr('style').trim()),
                };
                prices.discount.push(discount);
            });
            $('.car-card-equipment.car-card').each(function() {
                let $this = $(this);
                let info = {};
                $this.find('.car-card-right .carinfo li').each(function() {
                    let $info = $(this);
                    info[generateAlias($info.find('.label').text().trim())] = $info.find('.value').text().trim()
                });
                $this.find('.car-card-right .carinfo.last li').each(function() {
                    let $info = $(this);
                    let label = generateAlias($info.find('.label').text().trim());
                    if(label != '') {
                        info[label] = $info.find('.value').text().trim()
                    }
                });
                let p = [];
                $this.find('.car-list tr').each(function(i, e) {
                    if(i != 0) {
                        let $tr = $(this);
                        p.push({
                            color: {
                                name: $tr.find('.car-list-color').text().trim(),
                                code: getColorFromStyle($tr.find('.car-list-color i.color').attr('style'))
                            },
                            price: $tr.find('.car-list-price').text().trim()
                        });
                    }
                });
                let price = {
                    image_url: getBackgroundFromStyle($this.find('.car-card-photo').attr('style').trim()),
                    info: info,
                    prices: p
                };

                prices.price.push(price);
            });
            fs.writeFile(path.join(__dirname, BASE_DIR, 'prices', data.model + '.json'), JSON.stringify(prices), err => {
                if(err !== null) {
                    console.log(`Error while saving prices: ${data.model}`);
                    reject();
                }
                resolve(true);
            });
        })
    });
}

// Utils
function getBackgroundFromStyle(style) {
    let re = /background-image:url\((.*)\)/g;
    let result = re.exec(style);
    return result[1]
}

function getColorFromStyle(style) {
    let re = /background(-color)?:(.*)/g;
    let result = re.exec(style);
    return result[2];
}

function generateAlias(src) {
    return transliterate(src).toLowerCase().replace(/ /g,'_').replace(/[^\w-]+/g,'');
}

function transliterate(text) {
    return text.replace(/([а-яё])|([\s_-])|([^a-z\d])/gi,
        function (all, ch, space, words, i) {
            if (space || words) {
                return space ? '_' : '';
            }
            var code = ch.charCodeAt(0),
                index = code == 1025 || code == 1105 ? 0 :
                    code > 1071 ? code - 1071 : code - 1039,
                t = ['yo', 'a', 'b', 'v', 'g', 'd', 'e', 'zh',
                    'z', 'i', 'y', 'k', 'l', 'm', 'n', 'o', 'p',
                    'r', 's', 't', 'u', 'f', 'h', 'c', 'ch', 'sh',
                    'shch', '', 'y', '', 'e', 'yu', 'ya'
                ];
            return t[index];
        });
}

main();