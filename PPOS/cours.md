# Astuces PPOS 

La compilation se fait en deux étapes. 

- l'étape de *compilation* proprement dite :
  - la syntaxe est vérifiée ;
  - les variables et appels aux fonctions sont vérifiés pour s'assurer que toutes les déclarations existent ;
  - résultat : "objets"  (l'extension `.o`)
- l'étape "*d'édition de liens*" (*linking*) :
  - il est vérifié que les appels aux fonctions correspondent à leur définition ;
  - il est vérifié qu'une et une seule définition existe pour chacune des fonctions appelées ;
  - résultat : **exécutable**

<img src="assets/sum_odd.png" alt="Illustration des dépendances" style="zoom:67%;" />

**création de l'objet **

```C
gcc -c sum_odd.c -o sum_odd.o
```

**Linking**

````C
gcc -o sum_odd sum_odd.o
````

### Protection contre les inclusions multiples

Que se passe-t-il si par erreur on met deux fois un  `#include <stdio.h>`  dans un de vos programmes ?

Si les fichiers `.h` ne sont pas protégés contre cela (inclusions multiples), le compilateur risque de refuser de compiler. 

Il est pour cela nécessaire de protéger les fichiers `.h` contre les inclusions : 

```C
#pragma once
```

Cela doit être la toute première ligne de vos fichiers `.h`. 

**Solution : MAKEFILE **





### Make feedback 

before `make feedback` do `sudo service docker start`