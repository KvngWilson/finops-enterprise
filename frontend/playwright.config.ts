import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',use:{baseURL:'http://localhost:3128',viewport:{width:1440,height:1000}},reporter:'list',timeout:60000});
