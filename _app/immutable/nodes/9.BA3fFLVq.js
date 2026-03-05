import"../chunks/D_CFEhFU.js";import"../chunks/BrVUPLU9.js";import{g as p,F as a}from"../chunks/BJ45eFGE.js";import{C as n}from"../chunks/DiTO_LCi.js";const l=`import matplotlib.pyplot as plt
import pandas as pd
from pyodide.http import open_url

url = 'https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv'
df = pd.read_csv(open_url(url))
df.head()
plt.scatter(df['sepal_length'], df['sepal_width'])
plt.xlabel('Sepal Length')
plt.ylabel('Sepal Width')
plt.title('Iris Dataset - Sepal Length vs Width')
plt.show()`;function d(t){{let e=a(()=>({main:l}));n(t,{get fs(){return p(e)}})}}export{d as component};
