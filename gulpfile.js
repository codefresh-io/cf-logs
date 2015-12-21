var gulp        = require('gulp');
var jshint      = require('gulp-jshint');
var mocha       = require('gulp-mocha');
var cover       = require('gulp-coverage');
var rimraf      = require('gulp-rimraf');
var env         = require('gulp-env');
var runSequence = require('run-sequence');
var watch       = require('gulp-watch');
require('shelljs/global');


gulp.task('no.onlys', function (callback) {
    exec('find . -path "*/*.spec.js" -type f -exec grep -l "describe.only" {} + \n find . -path "*/*.spec.js" -type f -exec grep -l "it.only" {} +', function (code, output) { // jshint ignore:line
        if (output) return callback(new Error("The following files contain .only in their tests"));
        return callback();
    });
});

gulp.task('lint', ['clean'], function () {
    return gulp.src(['**/*.js', '!**/node_modules/**'])
        .pipe(jshint({lookup: true}))
        .pipe(jshint.reporter('default'))
        .pipe(jshint.reporter('fail'));
});


gulp.task('set_unit_env_vars', function () {
    env({
        vars: {}
    });
});

gulp.task('unit_pre', function () {
    return gulp.src(['**/*.unit.spec.js', '!**/node_modules/**/*.js'], {read: false})
        .pipe(cover.instrument({
            pattern: ['**/*.js', '!**/*.spec.js', '!**/node_modules/**/*.js', '!debug/**/*.js'],
            debugDirectory: '.debug'
        }))
        .pipe(mocha({reporter: 'spec', timeout: '10000'}))
        .pipe(cover.gather())
        .pipe(cover.format( {
            reporter: 'html',
            outFile: 'coverage-unit.html'
        }))
        .pipe(gulp.dest('coverage'))
        .pipe(cover.enforce( {
            statements: 80,
            blocks: 65,
            lines: 80,
            uncovered: undefined
        }))
        .once('error', function (err) {
            console.error(err);
            process.exit(1);
        })
        .once('end', function () {
            process.exit();
        });
});

gulp.task('unit_pre_no_coverage', function () {
    return gulp.src(['**/*.unit.spec.js', '!**/node_modules/**/*.js'], {read: false})
        .pipe(cover.instrument({
            pattern: ['**/*.js', '!**/*.spec.js', '!**/node_modules/**/*.js', '!debug/**/*.js'],
            debugDirectory: '.debug'
        }))
        .pipe(mocha({reporter: 'spec', timeout: '10000'}))
        .once('error', function (err) {
            console.error(err);
            this.emit('end');
        });
});


gulp.task('clean', function () {
    return gulp.src(['.coverdata', '.debug', '.coverrun'], {read: false})
        .pipe(rimraf());
});


gulp.task('unit_test', function (callback) {
    runSequence('set_unit_env_vars',
        'unit_pre',
        callback);
});

gulp.task('unit_test_no_coverage', function (callback) {
    runSequence('set_unit_env_vars',
        'unit_pre_no_coverage',
        callback);
});

gulp.task('watch', function () {
    watch(["./lib/*.js", "gulpfile.js", '**/*.unit.spec.js', '!**/node_modules/**/*.js'], function () {
        runSequence('lint', 'unit_test_no_coverage', 'clean');
    });
});